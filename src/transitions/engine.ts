import type { Clip } from "../projects/schema";
import { ease } from "../keyframes/interpolate";
export const transitions = [
  "none",
  "fade",
  "dissolve",
  "slide",
  "push",
  "wipe",
  "zoom",
  "spin",
  "blur",
  "flash",
  "glitch",
  "light-leak",
];
export function transitionState(c: Clip, time: number) {
  const duration = Math.min(c.transition.duration, c.duration / 2);
  const local = time - c.start;
  const t =
    duration > 0
      ? Math.min(1, local / duration, (c.duration - local) / duration)
      : 1;
  const e = ease(
    Math.max(0, t),
    ["linear", "ease-in", "ease-out", "ease-in-out"].includes(
      c.transition.easing,
    )
      ? (c.transition.easing as
          "linear" | "ease-in" | "ease-out" | "ease-in-out")
      : "ease-in-out",
  );
  const type = c.transition.type;
  return {
    progress: e,
    opacity: ["fade", "dissolve", "blur", "light-leak"].includes(type) ? e : 1,
    x: ["slide", "push"].includes(type)
      ? (1 - e) * c.transform.width * c.transition.direction
      : 0,
    scale: type === "zoom" ? Math.max(0.01, e) : 1,
    rotation: type === "spin" ? (1 - e) * 180 : 0,
    blur: type === "blur" ? (1 - e) * 24 : 0,
    flash: type === "flash" ? 1 - e : 0,
  };
}
