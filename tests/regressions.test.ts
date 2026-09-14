import { describe, it, expect } from "vitest";
import { newProject, newClip, MediaSchema, id } from "../src/projects/schema";
import { applyOperation, sourceTime } from "../src/timeline/operations";
import { evaluated } from "../src/keyframes/interpolate";
import { duplicateProject } from "../src/projects/duplicate";
import { useEditor } from "../src/editor/store";
function reverseFixture() {
  const project = newProject();
  const media = MediaSchema.parse({
    id: id(),
    name: "fixture.mp4",
    kind: "video",
    mime: "video/mp4",
    size: 1,
    duration: 20,
    added: 0,
  });
  project.media.push(media);
  project.clips.push(
    newClip("video", project.tracks[0].id, 2, {
      mediaId: media.id,
      reverse: true,
      inPoint: 3,
      duration: 10,
    }),
  );
  return project;
}
describe("Source continuity regressions", () => {
  it("reverse left trim preserves the surviving source frames", () => {
    const p = reverseFixture(),
      c = p.clips[0],
      before = sourceTime(c, 8);
    applyOperation(p, { type: "trim", id: c.id, edge: "left", time: 5 });
    expect(sourceTime(c, 8)).toBe(before);
    expect(c.inPoint).toBe(3);
  });
  it("reverse right trim keeps the first frame fixed and advances the low source bound", () => {
    const p = reverseFixture(),
      c = p.clips[0],
      before = sourceTime(c, c.start);
    applyOperation(p, { type: "trim", id: c.id, edge: "right", time: 8 });
    expect(sourceTime(c, c.start)).toBe(before);
    expect(c.inPoint).toBe(7);
  });
  it("left extension cannot make the timeline negative", () => {
    const p = reverseFixture(),
      c = p.clips[0];
    applyOperation(p, { type: "trim", id: c.id, edge: "left", time: -8 });
    expect(c.start).toBe(0);
  });
  it("split and duplicate work inside Immer history drafts", () => {
    const p = reverseFixture();
    useEditor.getState().load(p);
    useEditor.getState().dispatch({ type: "duplicate", id: p.clips[0].id });
    expect(useEditor.getState().project.clips).toHaveLength(2);
    useEditor.getState().undo();
    expect(useEditor.getState().project.clips).toHaveLength(1);
  });
  it("a left trim retains the interpolated keyframe boundary", () => {
    const p = reverseFixture(),
      c = p.clips[0];
    c.keyframes = [
      { id: id(), path: "opacity", time: 0, value: 0, easing: "linear" },
      { id: id(), path: "opacity", time: 10, value: 1, easing: "linear" },
    ];
    applyOperation(p, { type: "trim", id: c.id, edge: "left", time: 7 });
    expect(evaluated(c, 7).opacity).toBe(0.5);
    expect(evaluated(c, 9.5).opacity).toBe(0.75);
  });
  it("animates previously unset grade values", () => {
    const p = reverseFixture(),
      c = p.clips[0];
    c.keyframes = [
      { id: id(), path: "grade.exposure", time: 0, value: 0, easing: "linear" },
      { id: id(), path: "grade.exposure", time: 4, value: 1, easing: "linear" },
    ];
    expect(evaluated(c, 4).grade.exposure).toBe(0.5);
  });
  it("duplicated projects have independent cloud track and clip identifiers", () => {
    const p = reverseFixture(),
      copy = duplicateProject(p);
    expect(copy.id).not.toBe(p.id);
    expect(copy.tracks[0].id).not.toBe(p.tracks[0].id);
    expect(copy.clips[0].trackId).toBe(copy.tracks[0].id);
    expect(copy.clips[0].mediaId).toBe(p.clips[0].mediaId);
  });
});
