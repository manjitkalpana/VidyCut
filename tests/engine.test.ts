import { describe, it, expect } from "vitest";
import {
  newProject,
  newClip,
  ClipSchema,
  migrateProject,
  dimensions,
  id,
} from "../src/projects/schema";
import {
  applyOperation,
  snapTime,
  sourceTime,
} from "../src/timeline/operations";
import { interpolate, ease } from "../src/keyframes/interpolate";
import { useEditor } from "../src/editor/store";
import { parseSubtitles, serializeSubtitles } from "../src/captions/subtitles";
import { validateMedia } from "../src/media/validation";
import { validateExport } from "../src/export/engine";
function fixture() {
  const p = newProject();
  p.clips = [newClip("video", p.tracks[0].id, 2, { duration: 10, inPoint: 1 })];
  return p;
}
describe("Timeline", () => {
  it("moves clips and rejects negative time", () => {
    const p = fixture();
    applyOperation(p, { type: "move", id: p.clips[0].id, start: -3 });
    expect(p.clips[0].start).toBe(0);
  });
  it("blocks edits on locked tracks", () => {
    const p = fixture();
    p.tracks[0].locked = true;
    applyOperation(p, { type: "delete", id: p.clips[0].id });
    expect(p.clips).toHaveLength(1);
  });
  it("splits without losing source range", () => {
    const p = fixture();
    applyOperation(p, { type: "split", id: p.clips[0].id, time: 6 });
    expect(p.clips.map((c) => c.duration)).toEqual([4, 6]);
    expect(p.clips[1].inPoint).toBe(5);
  });
  it("keeps reverse source ranges continuous on split", () => {
    const p = fixture();
    p.clips[0].reverse = true;
    const before = sourceTime(p.clips[0], 7);
    applyOperation(p, { type: "split", id: p.clips[0].id, time: 6 });
    expect(sourceTime(p.clips[1], 7)).toBe(before);
  });
  it("trims left and retains frame minimum", () => {
    const p = fixture();
    applyOperation(p, {
      type: "trim",
      id: p.clips[0].id,
      edge: "left",
      time: 5,
    });
    expect(p.clips[0].inPoint).toBe(4);
    expect(p.clips[0].duration).toBe(7);
  });
  it("ripple delete only shifts the affected track", () => {
    const p = fixture();
    p.clips.push(
      newClip("video", p.tracks[0].id, 12),
      newClip("audio", p.tracks[1].id, 12),
    );
    applyOperation(p, { type: "delete", id: p.clips[0].id, ripple: true });
    expect(p.clips.map((c) => c.start)).toEqual([2, 12]);
  });
  it("speed preserves source span", () => {
    const p = fixture();
    applyOperation(p, { type: "speed", id: p.clips[0].id, speed: 2 });
    expect(p.clips[0].duration).toBe(5);
  });
  it("snaps to an edge", () => {
    const p = fixture();
    expect(snapTime(12.06, p)).toBe(12);
  });
});
describe("Project history", () => {
  it("undo and redo apply inverse commands", () => {
    const p = fixture();
    useEditor.getState().load(p);
    useEditor
      .getState()
      .dispatch({ type: "split", id: p.clips[0].id, time: 6 });
    expect(useEditor.getState().project.clips).toHaveLength(2);
    useEditor.getState().undo();
    expect(useEditor.getState().project.clips).toEqual(p.clips);
    useEditor.getState().redo();
    expect(useEditor.getState().project.clips).toHaveLength(2);
  });
  it("round trips project JSON", () => {
    const p = fixture();
    expect(migrateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it("rejects unknown versions", () =>
    expect(() => migrateProject({ ...fixture(), version: 900 })).toThrow());
  it("migrates version zero", () =>
    expect(migrateProject({ ...fixture(), version: 0 }).version).toBe(1));
});
describe("Keyframes", () => {
  it("interpolates linear keyframes", () => {
    expect(
      interpolate(
        [
          { id: id(), path: "opacity", time: 0, value: 0, easing: "linear" },
          { id: id(), path: "opacity", time: 2, value: 1, easing: "linear" },
        ],
        1,
        0,
      ),
    ).toBe(0.5);
  });
  it("supports custom bezier", () =>
    expect(ease(0.5, "bezier", [0.42, 0, 0.58, 1])).toBeCloseTo(0.5, 3));
});
describe("Captions and media", () => {
  it("round trips SRT and VTT", () => {
    const text = "1\n00:00:01,200 --> 00:00:03,400\nHello world";
    const parsed = parseSubtitles(text);
    expect(parsed[0].start).toBe(1.2);
    expect(parseSubtitles(serializeSubtitles(parsed, true))[0].text).toBe(
      "Hello world",
    );
  });
  it("rejects HTML disguised as media MIME", () =>
    expect(() =>
      validateMedia({ name: "x.mp4", size: 30, type: "text/html" }),
    ).toThrow());
  it("rejects empty files", () =>
    expect(() =>
      validateMedia({ name: "x.mp4", size: 0, type: "video/mp4" }),
    ).toThrow());
});
describe("Export", () => {
  it("computes landscape, portrait and square at 1080", () => {
    const p = fixture();
    expect(dimensions(p, "1080")).toEqual({ width: 1920, height: 1080 });
    p.width = 1080;
    p.height = 1920;
    expect(dimensions(p, "1080")).toEqual({ width: 1080, height: 1920 });
    p.height = 1080;
    expect(dimensions(p, "1080")).toEqual({ width: 1080, height: 1080 });
  });
  it("validates in/out bounds", () => {
    const p = fixture();
    p.inPoint = 10;
    p.outPoint = 5;
    expect(() => validateExport(p, p.export)).toThrow();
  });
  it("project clips receive complete defaults", () => {
    expect(ClipSchema.parse(newClip("text", "v")).audio.volume).toBe(1);
  });
});
