import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { zipSync, unzipSync } from "fflate";
import { newProject, newClip, MediaSchema } from "../src/projects/schema";
import {
  createProjectBundle,
  readProjectBundle,
  restoreProjectBundle,
} from "../src/projects/bundle";
import {
  getBlob,
  loadLast,
  saveProject,
  listProjects,
} from "../src/storage/local";
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
function fixture() {
  const p = newProject();
  p.media = [
    MediaSchema.parse({
      id: "source",
      name: "test.png",
      kind: "image",
      mime: "image/png",
      size: bytes.length,
      duration: 5,
      added: 1,
    }),
  ];
  p.clips = [newClip("image", p.tracks[0].id, 0, { mediaId: "source" })];
  return p;
}
const backup = () =>
  createProjectBundle(
    fixture(),
    {},
    async () => new Blob([bytes], { type: "image/png" }),
  );
it("round trips media and remaps identifiers", async () => {
  const p = fixture();
  const result = await readProjectBundle(await backup());
  expect(result.project.id).not.toBe(p.id);
  expect(result.project.media[0].id).not.toBe("source");
  expect(result.project.clips[0].mediaId).toBe(result.project.media[0].id);
  expect(
    new Uint8Array(
      await result.blobs.get(result.project.media[0].id)!.arrayBuffer(),
    ),
  ).toEqual(bytes);
});
it("restores sources and project without replacing existing projects", async () => {
  const original = fixture();
  await saveProject(original);
  const p = await restoreProjectBundle(await backup());
  expect((await loadLast())?.id).toBe(p.id);
  expect(await getBlob(p.media[0].id)).toBeDefined();
  expect((await listProjects()).some((x) => x.id === original.id)).toBe(true);
});
it("rejects missing media", async () => {
  await expect(
    createProjectBundle(fixture(), {}, async () => undefined),
  ).rejects.toThrow("missing");
});
it("rejects damaged payloads", async () => {
  const files = unzipSync(new Uint8Array(await (await backup()).arrayBuffer()));
  files["media/0.bin"][7] ^= 1;
  await expect(
    readProjectBundle(new Blob([zipSync(files, { level: 0 })])),
  ).rejects.toThrow("damaged");
});
it("rejects truncated archives and path traversal", async () => {
  const file = await backup();
  await expect(readProjectBundle(file.slice(0, -5))).rejects.toThrow(
    "incomplete",
  );
  await expect(
    readProjectBundle(new Blob([zipSync({ "../bad": bytes }, { level: 0 })])),
  ).rejects.toThrow("paths");
});
it("supports cancellation before reading or writing", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    readProjectBundle(await backup(), { signal: controller.signal }),
  ).rejects.toThrow();
  await expect(
    createProjectBundle(fixture(), { signal: controller.signal }),
  ).rejects.toThrow();
});
