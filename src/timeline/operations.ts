import { assembleClip } from "./assembly";
import { current, isDraft } from "immer";
import { id, ClipSchema, type Project, type Clip } from "../projects/schema";
import { clamp, interpolate } from "../keyframes/interpolate";
export type Operation =
  | { type: "move"; id: string; start: number; trackId?: string }
  | { type: "trim"; id: string; edge: "left" | "right"; time: number }
  | { type: "split"; id: string; time: number }
  | { type: "delete"; id: string; ripple?: boolean }
  | { type: "duplicate"; id: string; at?: number }
  | { type: "update"; id: string; changes: Partial<Clip> }
  | { type: "add" | "insert" | "overwrite"; clip: Clip }
  | { type: "speed"; id: string; speed: number };
export function applyOperation(p: Project, op: Operation) {
  if ("clip" in op) {
    if (op.type !== "add") {
      assembleClip(p, op.clip, op.type);
      return;
    }
    const clip = ClipSchema.parse(op.clip);
    const track = p.tracks.find((t) => t.id === clip.trackId);
    if (
      !track ||
      track.locked ||
      (clip.kind === "audio") !== (track.kind === "audio") ||
      p.clips.some((c) => c.id === clip.id)
    )
      return;
    p.clips.push(clip);
    return;
  }
  const c = p.clips.find((c) => c.id === op.id);
  if (!c || p.tracks.find((t) => t.id === c.trackId)?.locked) return;
  const frame = 1 / p.fps;
  if (op.type === "move") {
    const target = p.tracks.find((t) => t.id === (op.trackId ?? c.trackId));
    if (
      !target ||
      target.locked ||
      (c.kind === "audio") !== (target.kind === "audio")
    )
      return;
    c.start = Math.max(0, op.start);
    c.trackId = target.id;
  }
  if (op.type === "trim") {
    const media = p.media.find((m) => m.id === c.mediaId);
    const bounded = media && media.kind !== "image" && c.freeze === undefined;
    if (op.edge === "left") {
      const available = bounded
        ? c.reverse
          ? (media.duration - c.inPoint - c.duration * c.speed) / c.speed
          : c.inPoint / c.speed
        : Infinity;
      const delta = clamp(
        op.time - c.start,
        Math.max(-c.start, -Math.max(0, available)),
        c.duration - frame,
      );
      c.start += delta;
      if (!c.reverse) c.inPoint += delta * c.speed;
      c.duration -= delta;
      const keys = c.keyframes;
      c.keyframes = keys
        .filter((k) => k.time > delta)
        .map((k) => ({ ...k, time: k.time - delta }));
      for (const path of new Set(keys.map((k) => k.path)))
        c.keyframes.push({
          id: id(),
          path,
          time: 0,
          value: interpolate(
            keys.filter((k) => k.path === path),
            delta,
            0,
          ),
          easing: "linear",
        });
    } else {
      const max = bounded
        ? c.reverse
          ? c.duration + c.inPoint / c.speed
          : (media.duration - c.inPoint) / c.speed
        : Infinity;
      const next = clamp(op.time - c.start, frame, Math.max(frame, max));
      if (c.reverse && bounded) c.inPoint += (c.duration - next) * c.speed;
      c.duration = next;
    }
  }
  if (op.type === "split") {
    const t = op.time - c.start;
    if (t < frame || t > c.duration - frame) return;
    const right = structuredClone(isDraft(c) ? current(c) : c);
    right.id = id();
    right.start = op.time;
    right.duration = c.duration - t;
    if (c.reverse) {
      right.inPoint = c.inPoint;
      c.inPoint += right.duration * c.speed;
    } else right.inPoint += t * c.speed;
    for (const path of new Set(c.keyframes.map((k) => k.path))) {
      const keys = c.keyframes.filter((k) => k.path === path);
      const at = interpolate(keys, t, 0);
      c.keyframes = c.keyframes.filter((k) => k.path !== path || k.time < t);
      c.keyframes.push({
        id: id(),
        path,
        time: t,
        value: at,
        easing: "linear",
      });
      right.keyframes = right.keyframes.filter(
        (k) => k.path !== path || k.time > t,
      );
      right.keyframes.push({
        id: id(),
        path,
        time: t,
        value: at,
        easing: "linear",
      });
    }
    right.keyframes = right.keyframes.map((k) => ({
      ...k,
      id: id(),
      time: Math.max(0, k.time - t),
    }));
    c.duration = t;
    p.clips.push(right);
  }
  if (op.type === "delete") {
    p.clips = p.clips.filter((x) => x.id !== c.id);
    if (op.ripple)
      p.clips.forEach((x) => {
        if (x.trackId === c.trackId && x.start >= c.start + c.duration)
          x.start = Math.max(0, x.start - c.duration);
      });
  }
  if (op.type === "duplicate") {
    p.clips.push({
      ...structuredClone(isDraft(c) ? current(c) : c),
      id: id(),
      start: op.at ?? c.start + c.duration,
      keyframes: c.keyframes.map((k) => ({ ...k, id: id() })),
    });
  }
  if (op.type === "update") Object.assign(c, op.changes);
  if (op.type === "speed") {
    const speed = clamp(op.speed, 0.1, 8);
    c.duration = (c.duration * c.speed) / speed;
    c.keyframes.forEach((k) => (k.time = (k.time * c.speed) / speed));
    c.speed = speed;
  }
}
export function snapTime(
  time: number,
  p: Project,
  excluded?: string,
  tolerance = 0.15,
) {
  const points = [
    0,
    ...p.markers.map((m) => m.time),
    ...p.clips
      .filter((c) => c.id !== excluded)
      .flatMap((c) => [c.start, c.start + c.duration]),
  ];
  let result = time,
    min = tolerance;
  for (const v of points) {
    const d = Math.abs(time - v);
    if (d < min) {
      min = d;
      result = v;
    }
  }
  return Math.max(0, result);
}
export function sourceTime(c: Clip, time: number) {
  if (c.freeze !== undefined) return c.freeze;
  const relative = clamp(time - c.start, 0, c.duration);
  return c.inPoint + (c.reverse ? c.duration - relative : relative) * c.speed;
}
