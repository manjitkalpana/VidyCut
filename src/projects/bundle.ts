import { Zip, ZipPassThrough, Unzip, strToU8 } from "fflate";
import { z } from "zod";
import { id, migrateProject, type Media, type Project } from "./schema";
import { duplicateProject } from "./duplicate";
import { mediaBlob } from "../media/registry";
import { validateMedia, validateSignature } from "../media/validation";
import { commitPortableProject } from "../storage/local";

export const MAX_BUNDLE_BYTES = 2 * 1024 ** 3;
const MAX_JSON_BYTES = 20 * 1024 ** 2;
const ManifestSchema = z
  .object({
    format: z.literal("vidycut-portable"),
    version: z.literal(1),
    media: z
      .array(
        z
          .object({
            id: z.string(),
            path: z.string().regex(/^media\/[0-9]+\.bin$/),
            size: z.number().int().positive().max(MAX_BUNDLE_BYTES),
            crc32: z.number().int().min(0).max(0xffffffff),
          })
          .strict(),
      )
      .max(5000),
  })
  .strict();
export interface BundleProgress {
  stage: string;
  progress: number;
  bytes: number;
}
type Options = {
  signal?: AbortSignal;
  onProgress?: (progress: BundleProgress) => void;
};
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crcChunk = (value: number, bytes: Uint8Array) => {
  for (const byte of bytes)
    value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return value;
};
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Store media without recompression; chunks keep the main thread responsive. */
export async function createProjectBundle(
  source: Project,
  options: Options = {},
  resolveMedia: (media: Media) => Promise<Blob | undefined> = mediaBlob,
): Promise<Blob> {
  const project = migrateProject(structuredClone(source));
  if (
    project.clips.some(
      (c) => c.mediaId && !project.media.some((m) => m.id === c.mediaId),
    )
  )
    throw new Error(
      "A clip references missing media. Relink it before making a backup.",
    );
  const media: { info: Media; blob: Blob }[] = [];
  let total = 0;
  for (const info of project.media) {
    options.signal?.throwIfAborted();
    const blob = await resolveMedia(info);
    if (!blob)
      throw new Error(
        `Media file is missing: ${info.name}. Relink it before making a backup.`,
      );
    total += blob.size;
    if (total > MAX_BUNDLE_BYTES - MAX_JSON_BYTES)
      throw new Error(
        "This backup exceeds the browser bundle budget of 2 GB. Keep a JSON backup and the original media files instead.",
      );
    info.size = blob.size;
    delete info.proxyId;
    delete info.builtin;
    delete info.storagePath;
    media.push({ info, blob });
  }
  const chunks: BlobPart[] = [];
  let failure: Error | undefined,
    finished = false,
    archiveBytes = 0,
    processed = 0;
  const zip = new Zip((error, data, final) => {
    if (error) {
      failure = error;
      return;
    }
    archiveBytes += data.length;
    if (archiveBytes > MAX_BUNDLE_BYTES) {
      failure = new Error(
        "The backup exceeds the browser bundle budget of 2 GB.",
      );
      return;
    }
    chunks.push(data as Uint8Array<ArrayBuffer>);
    finished = final;
  });
  const manifest: z.infer<typeof ManifestSchema> = {
    format: "vidycut-portable",
    version: 1,
    media: [],
  };
  try {
    for (let i = 0; i < media.length; i++) {
      const { info, blob } = media[i],
        path = `media/${i}.bin`,
        entry = new ZipPassThrough(path);
      zip.add(entry);
      let crc = 0xffffffff;
      for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
        options.signal?.throwIfAborted();
        const chunk = new Uint8Array(
          await blob.slice(offset, offset + 1024 * 1024).arrayBuffer(),
        );
        crc = crcChunk(crc, chunk);
        entry.push(chunk, false);
        processed += chunk.length;
        if (failure) throw failure;
        options.onProgress?.({
          stage: `Packing ${info.name}`,
          progress: (processed / Math.max(1, total)) * 0.95,
          bytes: processed,
        });
        await tick();
      }
      entry.push(new Uint8Array(), true);
      manifest.media.push({
        id: info.id,
        path,
        size: blob.size,
        crc32: (crc ^ 0xffffffff) >>> 0,
      });
    }
    for (const [name, value] of [
      ["project.json", project],
      ["manifest.json", manifest],
    ] as const) {
      const bytes = strToU8(JSON.stringify(value));
      if (bytes.length > MAX_JSON_BYTES)
        throw new Error("Project metadata exceeds the 20 MB backup budget.");
      const entry = new ZipPassThrough(name);
      zip.add(entry);
      entry.push(bytes, true);
    }
    options.signal?.throwIfAborted();
    zip.end();
    if (failure) throw failure;
    if (!finished)
      throw new Error("The project backup could not be completed.");
    options.onProgress?.({
      stage: "Backup ready",
      progress: 1,
      bytes: archiveBytes,
    });
    return new Blob(chunks, { type: "application/zip" });
  } finally {
    zip.terminate();
  }
}

/** Parse only our stored ZIP format, with explicit budgets and no path extraction. */
export async function readProjectBundle(
  file: Blob,
  options: Options = {},
): Promise<{ project: Project; blobs: Map<string, Blob> }> {
  if (!file.size || file.size > MAX_BUNDLE_BYTES)
    throw new Error("Choose a VidyCut backup under 2 GB.");
  options.signal?.throwIfAborted();
  const tail = new DataView(await file.slice(-22).arrayBuffer());
  if (
    tail.byteLength !== 22 ||
    tail.getUint32(0, true) !== 0x06054b50 ||
    tail.getUint16(20, true) !== 0 ||
    tail.getUint16(4, true) !== 0 ||
    tail.getUint16(6, true) !== 0 ||
    tail.getUint32(16, true) + tail.getUint32(12, true) !== file.size - 22
  )
    throw new Error("The backup is incomplete or unsupported.");
  const files = new Map<
    string,
    { parts: BlobPart[]; size: number; crc: number; done: boolean }
  >();
  let failure: Error | undefined,
    total = 0;
  const unzip = new Unzip((entry) => {
    if (
      !/^(project\.json|manifest\.json|media\/[0-9]+\.bin)$/.test(entry.name) ||
      files.has(entry.name) ||
      files.size >= 5002
    )
      throw new Error("The backup contains invalid or duplicate file paths.");
    if (entry.compression !== 0)
      throw new Error(
        "This is not a supported VidyCut backup. Use the original unmodified backup ZIP.",
      );
    const value = {
      parts: [] as BlobPart[],
      size: 0,
      crc: 0xffffffff,
      done: false,
    };
    files.set(entry.name, value);
    entry.ondata = (error, data, final) => {
      if (error) {
        failure = error;
        return;
      }
      value.size += data.length;
      total += data.length;
      if (
        total > MAX_BUNDLE_BYTES ||
        (entry.name.endsWith(".json") && value.size > MAX_JSON_BYTES)
      ) {
        failure = new Error("The backup exceeds its allowed data budget.");
        entry.terminate();
        return;
      }
      value.crc = crcChunk(value.crc, data);
      value.parts.push(data as Uint8Array<ArrayBuffer>);
      value.done = final;
    };
    entry.start();
  });
  try {
    for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
      options.signal?.throwIfAborted();
      const data = new Uint8Array(
        await file.slice(offset, offset + 1024 * 1024).arrayBuffer(),
      );
      unzip.push(data, offset + data.length === file.size);
      if (failure) throw failure;
      options.onProgress?.({
        stage: "Reading backup",
        progress: ((offset + data.length) / file.size) * 0.8,
        bytes: offset + data.length,
      });
      await tick();
    }
    if ([...files.values()].some((value) => !value.done))
      throw new Error("The backup is incomplete.");
    const readJSON = async (name: string) => {
      const value = files.get(name);
      if (!value) throw new Error("This is not a VidyCut portable backup.");
      return JSON.parse(await new Blob(value.parts).text());
    };
    const manifest = ManifestSchema.parse(await readJSON("manifest.json"));
    const original = migrateProject(await readJSON("project.json"));
    if (
      new Set(manifest.media.map((m) => m.id)).size !== manifest.media.length ||
      new Set(manifest.media.map((m) => m.path)).size !==
        manifest.media.length ||
      manifest.media.length !== original.media.length ||
      files.size !== manifest.media.length + 2
    )
      throw new Error("The backup media manifest does not match its contents.");
    const mediaIds = new Set(original.media.map((m) => m.id));
    if (original.clips.some((c) => c.mediaId && !mediaIds.has(c.mediaId)))
      throw new Error("The backup has a missing media reference.");
    const blobs = new Map<string, Blob>(),
      mapping = new Map<string, string>();
    for (const media of original.media) {
      options.signal?.throwIfAborted();
      const record = manifest.media.find((item) => item.id === media.id),
        value = record && files.get(record.path);
      if (
        !record ||
        !value ||
        value.size !== record.size ||
        value.size !== media.size ||
        (value.crc ^ 0xffffffff) >>> 0 !== record.crc32
      )
        throw new Error(`Backup media is missing or damaged: ${media.name}.`);
      const blob = new Blob(value.parts, { type: media.mime });
      validateMedia({ name: media.name, type: media.mime, size: blob.size });
      await validateSignature(blob);
      if (
        (media.kind === "video" && !media.mime.startsWith("video/")) ||
        (media.kind === "audio" && !media.mime.startsWith("audio/")) ||
        (media.kind === "image" && !media.mime.startsWith("image/"))
      )
        throw new Error("A backup media type does not match its metadata.");
      const nextId = id();
      mapping.set(media.id, nextId);
      blobs.set(nextId, blob);
    }
    const project = duplicateProject(original);
    project.name = original.name;
    project.created = Date.now();
    project.media = project.media.map((media) => {
      const next = { ...media, id: mapping.get(media.id)! };
      delete next.proxyId;
      delete next.builtin;
      delete next.storagePath;
      return next;
    });
    project.clips.forEach((clip) => {
      if (clip.mediaId) clip.mediaId = mapping.get(clip.mediaId)!;
    });
    options.onProgress?.({
      stage: "Backup validated",
      progress: 0.95,
      bytes: file.size,
    });
    return { project, blobs };
  } catch (error) {
    options.signal?.throwIfAborted();
    throw new Error(
      error instanceof Error && !(error instanceof z.ZodError)
        ? error.message
        : "This backup is invalid or uses an unsupported format.",
    );
  }
}

export async function restoreProjectBundle(file: Blob, options: Options = {}) {
  const result = await readProjectBundle(file, options);
  options.signal?.throwIfAborted();
  await commitPortableProject(result.project, result.blobs, options.signal);
  options.onProgress?.({
    stage: "Project restored",
    progress: 1,
    bytes: file.size,
  });
  return result.project;
}
