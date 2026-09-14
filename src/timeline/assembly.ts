import { current, isDraft } from "immer";
import { id, ClipSchema, type Clip, type Project } from "../projects/schema";
import { interpolate } from "../keyframes/interpolate";

/** Retain a source interval while rebasing its timeline and numeric automation. */
export function sliceClip(
  clip: Clip,
  from: number,
  to: number,
  start: number,
  keepId = false,
): Clip | undefined {
  const a = Math.max(0, from - clip.start);
  const b = Math.min(clip.duration, to - clip.start);
  if (b - a < 0.01 - 1e-9) return undefined;
  const next = structuredClone(isDraft(clip) ? current(clip) : clip);
  next.id = keepId ? clip.id : id();
  next.start = start;
  next.duration = b - a;
  next.inPoint =
    clip.inPoint + (clip.reverse ? clip.duration - b : a) * clip.speed;
  next.keyframes = [];
  for (const path of new Set(clip.keyframes.map((key) => key.path))) {
    const keys = clip.keyframes
      .filter((key) => key.path === path)
      .sort((a, b) => a.time - b.time);
    next.keyframes.push({
      id: id(),
      path,
      time: 0,
      value: interpolate(keys, a, 0),
      easing: "linear",
    });
    for (const key of keys)
      if (key.time > a && key.time < b)
        next.keyframes.push({ ...key, id: id(), time: key.time - a });
    const destination = keys.find((key) => key.time >= b);
    next.keyframes.push({
      id: id(),
      path,
      time: b - a,
      value: interpolate(keys, b, 0),
      easing: destination?.easing ?? "linear",
      ...(destination?.bezier ? { bezier: destination.bezier } : {}),
    });
  }
  return next;
}

/** Only the named destination track changes. The caller records one undo command. */
export function assembleClip(
  project: Project,
  incoming: Clip,
  mode: "insert" | "overwrite",
) {
  const clip = ClipSchema.parse(incoming);
  const track = project.tracks.find((track) => track.id === clip.trackId);
  if (
    !track ||
    track.locked ||
    (clip.kind === "audio") !== (track.kind === "audio")
  )
    return;
  if (project.clips.some((existing) => existing.id === clip.id)) return;
  const from = clip.start,
    to = from + clip.duration;
  project.clips = project.clips.flatMap((existing) => {
    if (existing.trackId !== track.id) return [existing];
    const end = existing.start + existing.duration;
    if (mode === "insert") {
      if (end <= from) return [existing];
      if (existing.start >= from) {
        existing.start += clip.duration;
        return [existing];
      }
      const left = sliceClip(
        existing,
        existing.start,
        from,
        existing.start,
        true,
      );
      const right = sliceClip(existing, from, end, to, !left);
      return [left, right].filter((part): part is Clip => !!part);
    }
    if (end <= from || existing.start >= to) return [existing];
    const left = sliceClip(
      existing,
      existing.start,
      from,
      existing.start,
      true,
    );
    const right = sliceClip(existing, to, end, to, !left);
    return [left, right].filter((part): part is Clip => !!part);
  });
  project.clips.push(clip);
}
