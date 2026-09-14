import { getBlob, putBlob } from "../storage/local";
import {
  MediaSchema,
  id,
  type Media,
  type Clip,
  type Project,
  newClip,
} from "../projects/schema";
import { validateMedia, validateSignature } from "./validation";
import { useEditor } from "../editor/store";
const urls = new Map<string, string>();
const images = new Map<string, HTMLImageElement>();
export async function mediaBlob(m: Media) {
  return (
    (await getBlob(m.id)) ??
    (m.builtin ? await (await fetch(m.builtin)).blob() : undefined)
  );
}
export async function mediaURL(m: Media) {
  if (urls.has(m.id)) return urls.get(m.id)!;
  const blob = await mediaBlob(m);
  if (!blob) throw new Error("Media file is missing. Relink " + m.name + ".");
  const url = URL.createObjectURL(blob);
  urls.set(m.id, url);
  return url;
}
export async function mediaImage(m: Media) {
  if (images.has(m.id)) return images.get(m.id)!;
  const img = new Image();
  img.src = await mediaURL(m);
  await img.decode();
  images.set(m.id, img);
  return img;
}
export function releaseMedia(id: string) {
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
  images.delete(id);
}
export function releaseAll() {
  [...urls.keys()].forEach(releaseMedia);
}
export async function inspectFile(file: File): Promise<Media> {
  validateMedia(file);
  await validateSignature(file);
  const kind = file.type.startsWith("image")
    ? "image"
    : file.type.startsWith("audio")
      ? "audio"
      : "video";
  const url = URL.createObjectURL(file);
  const m = MediaSchema.parse({
    id: id(),
    name: file.name,
    kind,
    mime: file.type,
    size: file.size,
    duration: kind === "image" ? 5 : 0,
    added: Date.now(),
    folder:
      (file as File & { webkitRelativePath: string }).webkitRelativePath
        ?.split("/")
        .slice(0, -1)
        .join("/") ?? "",
  });
  try {
    const canvas = document.createElement("canvas");
    if (kind === "image") {
      const img = new Image();
      img.src = url;
      await img.decode();
      m.width = img.naturalWidth;
      m.height = img.naturalHeight;
      canvas.width = 320;
      canvas.height = Math.max(1, Math.round((320 * m.height) / m.width));
      canvas
        .getContext("2d")!
        .drawImage(img, 0, 0, canvas.width, canvas.height);
      m.thumbnail = canvas.toDataURL("image/jpeg", 0.7);
    } else {
      const element = document.createElement(
        kind === "audio" ? "audio" : "video",
      );
      element.preload = "metadata";
      element.src = url;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(new Error("Video format is not supported by your browser.")),
          20000,
        );
        element.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve();
        };
        element.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Video format is not supported."));
        };
      });
      m.duration = Number.isFinite(element.duration) ? element.duration : 0;
      if (!m.duration) {
        const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
        const input = new Input({
          source: new BlobSource(file),
          formats: ALL_FORMATS,
        });
        m.duration = await input.computeDuration();
        input.dispose();
      }
      if (kind === "video") {
        const v = element as HTMLVideoElement;
        m.width = v.videoWidth;
        m.height = v.videoHeight;
        v.currentTime = Math.min(0.1, m.duration / 2);
        await new Promise<void>((resolve) => {
          v.onseeked = () => resolve();
          setTimeout(resolve, 1500);
        });
        canvas.width = 320;
        canvas.height = Math.max(1, Math.round((320 * m.height) / m.width));
        canvas
          .getContext("2d")!
          .drawImage(v, 0, 0, canvas.width, canvas.height);
        m.thumbnail = canvas.toDataURL("image/jpeg", 0.7);
        try {
          const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
          const input = new Input({
            source: new BlobSource(file),
            formats: ALL_FORMATS,
          });
          const track = await input.getPrimaryVideoTrack();
          const stats = await track?.computePacketStats(100);
          m.fps = stats?.averagePacketRate;
          input.dispose();
        } catch {
          /* Metadata remains usable without an estimated frame rate. */
        }
      }
      element.removeAttribute("src");
      element.load();
    }
    await putBlob(m.id, file);
    return m;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function importFiles(files: FileList | File[]) {
  const s = useEditor.getState();
  let count = 0;
  for (const file of Array.from(files)) {
    try {
      const m = await inspectFile(file);
      s.mutate("Import media", (p) => {
        p.media.push(m);
      });
      count++;
      if (m.kind === "audio" || m.kind === "video") {
        void import("../audio-engine/engine")
          .then(async ({ analyzeMedia }) => {
            if (file.size > 100 * 1024 * 1024) return;
            const analysis = await analyzeMedia(m);
            s.mutate("Analyze waveform", (p) => {
              const entry = p.media.find((x) => x.id === m.id);
              if (entry) entry.waveform = analysis.wave;
            });
          })
          .catch(() => {});
      }
    } catch (e) {
      s.notify(
        e instanceof Error ? e.message : "This media could not be imported.",
      );
    }
  }
  if (count) s.notify(`${count} file${count === 1 ? "" : "s"} imported`);
}
export function addMediaToTimeline(
  mediaId: string,
  start?: number,
  trackId?: string,
  mode: "add" | "insert" | "overwrite" = "add",
) {
  const s = useEditor.getState(),
    m = s.project.media.find((m) => m.id === mediaId);
  if (!m) return;
  const kind = m.kind === "audio" ? "audio" : "video";
  if (
    trackId &&
    !s.project.tracks.some(
      (t) => t.id === trackId && t.kind === kind && !t.locked,
    )
  ) {
    s.notify("Choose an unlocked track that matches this media type.");
    return;
  }
  let track =
    s.project.tracks.find(
      (t) => t.id === trackId && t.kind === kind && !t.locked,
    ) ?? s.project.tracks.find((t) => t.kind === kind && !t.locked);
  if (!track) {
    const t = s.addTrack(kind);
    track = useEditor.getState().project.tracks.find((x) => x.id === t)!;
  }
  const at =
    start ??
    Math.max(
      0,
      ...s.project.clips
        .filter((c) => c.trackId === track!.id)
        .map((c) => c.start + c.duration),
    );
  const fit = Math.min(
    s.project.width / (m.width || 1920),
    s.project.height / (m.height || 1080),
  );
  const clip = newClip(m.kind, track.id, at, {
    mediaId: m.id,
    name: m.name,
    duration: m.duration || 5,
    transform: {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      width: (m.width || 1920) * fit,
      height: (m.height || 1080) * fit,
      anchorX: 0.5,
      anchorY: 0.5,
      flipX: false,
      flipY: false,
    },
  });
  s.dispatch({ type: mode, clip });
  s.select(clip.id);
  return clip;
}
export async function relinkMedia(mediaId: string, file: File) {
  const m = await inspectFile(file);
  const s = useEditor.getState();
  const existing = s.project.media.find((x) => x.id === mediaId);
  if (existing && existing.kind !== m.kind)
    throw new Error("Choose the same media type to relink this file.");
  s.mutate("Relink media", (p) => {
    const i = p.media.findIndex((x) => x.id === mediaId);
    if (i >= 0) {
      p.media[i] = m;
      for (const c of p.clips) if (c.mediaId === mediaId) c.mediaId = m.id;
    }
  });
}
export function clipMedia(p: Project, c: Clip) {
  return p.media.find((m) => m.id === c.mediaId);
}
