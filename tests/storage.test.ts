import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { newProject, newClip } from "../src/projects/schema";
import {
  saveProject,
  loadLast,
  listProjects,
  putBlob,
  getBlob,
  importProject,
} from "../src/storage/local";
import { validateSignature } from "../src/media/validation";
describe("Local persistence", () => {
  it("saves and reloads project definitions and media blobs separately", async () => {
    const p = newProject();
    p.clips.push(newClip("text", p.tracks[0].id));
    await saveProject(p);
    await putBlob("test-source", new Blob(["media bytes"]));
    expect(await loadLast()).toEqual(p);
    expect((await listProjects()).some((x) => x.id === p.id)).toBe(true);
    expect(await (await getBlob("test-source"))!.text()).toBe("media bytes");
  });
  it("rejects imported projects with duplicate identifiers", async () => {
    const p = newProject();
    p.tracks.push(p.tracks[0]);
    await expect(
      importProject(new File([JSON.stringify(p)], "bad.json")),
    ).rejects.toThrow("duplicate");
  });
  it("rejects executable content carrying a video MIME type", async () => {
    await expect(
      validateSignature(
        new Blob(["<html><script>alert(1)</script></html>"], {
          type: "video/mp4",
        }),
      ),
    ).rejects.toThrow();
  });
});
