import { it, expect } from "vitest";
import { newProject, newClip } from "../src/projects/schema";
import { applyOperation, sourceTime } from "../src/timeline/operations";
import { useEditor } from "../src/editor/store";
function fixture() {
  const p = newProject();
  p.clips = [
    newClip("video", p.tracks[0].id, 0, { duration: 10, inPoint: 3 }),
    newClip("audio", p.tracks[1].id, 0, { duration: 10 }),
  ];
  return p;
}
it("inserts into one track, preserving both source fragments", () => {
  const p = fixture();
  applyOperation(p, {
    type: "insert",
    clip: newClip("video", p.tracks[0].id, 4, { duration: 2 }),
  });
  expect(
    p.clips
      .filter((c) => c.kind === "video")
      .map((c) => [c.start, c.duration, c.inPoint]),
  ).toEqual([
    [0, 4, 3],
    [6, 6, 7],
    [4, 2, 0],
  ]);
  expect(p.clips.find((c) => c.kind === "audio")?.duration).toBe(10);
});
it("overwrites an interval without shifting later content", () => {
  const p = fixture();
  applyOperation(p, {
    type: "overwrite",
    clip: newClip("video", p.tracks[0].id, 4, { duration: 2 }),
  });
  expect(
    p.clips
      .filter((c) => c.kind === "video")
      .map((c) => [c.start, c.duration, c.inPoint]),
  ).toEqual([
    [0, 4, 3],
    [6, 4, 9],
    [4, 2, 0],
  ]);
});
it("preserves reverse source time through overwrite", () => {
  const p = fixture();
  p.clips[0].reverse = true;
  const original = structuredClone(p.clips[0]);
  applyOperation(p, {
    type: "overwrite",
    clip: newClip("video", p.tracks[0].id, 4, { duration: 2 }),
  });
  for (const t of [1, 7]) {
    const c = p.clips.find(
      (c) => c.kind === "video" && c.start <= t && c.start + c.duration > t,
    )!;
    expect(sourceTime(c, t)).toBeCloseTo(sourceTime(original, t));
  }
});
it("rejects locked destination and undoes insertion in one command", () => {
  const p = fixture();
  const clip = newClip("video", p.tracks[0].id, 4, { duration: 2 });
  p.tracks[0].locked = true;
  applyOperation(p, { type: "insert", clip });
  expect(p.clips).toHaveLength(2);
  p.tracks[0].locked = false;
  useEditor.getState().load(p);
  useEditor.getState().dispatch({ type: "insert", clip });
  expect(useEditor.getState().project.clips).toHaveLength(4);
  useEditor.getState().undo();
  expect(useEditor.getState().project.clips).toEqual(p.clips);
  useEditor.getState().redo();
  expect(useEditor.getState().project.clips).toHaveLength(4);
});
