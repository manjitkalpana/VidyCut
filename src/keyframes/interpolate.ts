import type { Clip, Keyframe } from "../projects/schema";
export const clamp = (n: number, a: number, b: number) =>
  Math.min(b, Math.max(a, n));
export function ease(
  t: number,
  e: Keyframe["easing"],
  curve = [0.25, 0.1, 0.25, 1],
) {
  t = clamp(t, 0, 1);
  if (e === "ease-in") return t * t;
  if (e === "ease-out") return 1 - (1 - t) ** 2;
  if (e === "ease-in-out")
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  if (e === "bezier") {
    const b = (x: number, a: number, c: number) =>
      3 * (1 - x) ** 2 * x * a + 3 * (1 - x) * x * x * c + x * x * x;
    let low = 0,
      high = 1,
      u = t;
    for (let i = 0; i < 15; i++) {
      u = (low + high) / 2;
      if (b(u, curve[0], curve[2]) < t) low = u;
      else high = u;
    }
    return b(u, curve[1], curve[3]);
  }
  return t;
}
export function interpolate(keys: Keyframe[], time: number, fallback: number) {
  if (!keys.length) return fallback;
  const sorted = [...keys].sort((a, b) => a.time - b.time);
  if (time <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (time >= last.time) return last.value;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1],
      b = sorted[i];
    if (time <= b.time) {
      const t = ease((time - a.time) / (b.time - a.time), b.easing, b.bezier);
      return a.value + (b.value - a.value) * t;
    }
  }
  return fallback;
}
export function valueAt(c: Clip, path: string, time: number, fallback: number) {
  return interpolate(
    c.keyframes.filter((k) => k.path === path),
    time - c.start,
    fallback,
  );
}
export function evaluated(c: Clip, time: number): Clip {
  if (!c.keyframes.length) return c;
  const next = structuredClone(c);
  for (const path of new Set(c.keyframes.map((k) => k.path))) {
    const parts = path.split(".");
    if (
      parts.some((p) => ["__proto__", "prototype", "constructor"].includes(p))
    )
      continue;
    let obj: Record<string, unknown> = next as unknown as Record<
      string,
      unknown
    >;
    for (let i = 0; i < parts.length - 1; i++) {
      const value = obj[parts[i]];
      if (!value || typeof value !== "object") {
        obj = {};
        break;
      }
      obj = value as Record<string, unknown>;
    }
    const end = parts[parts.length - 1];
    if (
      typeof obj[end] === "number" ||
      (parts.length === 2 && parts[0] === "grade")
    )
      obj[end] = valueAt(
        c,
        path,
        time,
        typeof obj[end] === "number" ? (obj[end] as number) : 0,
      );
  }
  return next;
}
