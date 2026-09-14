import type { Clip } from "../projects/schema";
export function applyMask(
  ctx: CanvasRenderingContext2D,
  c: Clip,
  w: number,
  h: number,
) {
  const m = c.mask;
  if (m.type === "none") return;
  ctx.save();
  ctx.globalCompositeOperation = m.invert
    ? "destination-out"
    : "destination-in";
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const g = mask.getContext("2d")!;
  g.translate(w / 2 + m.x * w, h / 2 + m.y * h);
  g.rotate((m.rotation * Math.PI) / 180);
  g.filter = m.feather ? `blur(${(m.feather * w) / 100}px)` : "none";
  g.fillStyle = "#fff";
  if (m.type === "circle") {
    g.beginPath();
    g.ellipse(0, 0, (w * m.scale) / 2, (h * m.scale) / 2, 0, 0, Math.PI * 2);
    g.fill();
  } else if (m.type === "rectangle")
    g.fillRect(
      (-w * m.scale) / 2,
      (-h * m.scale) / 2,
      w * m.scale,
      h * m.scale,
    );
  else {
    const grad =
      m.type === "radial"
        ? g.createRadialGradient(0, 0, 0, 0, 0, (Math.max(w, h) * m.scale) / 2)
        : g.createLinearGradient((-w * m.scale) / 2, 0, (w * m.scale) / 2, 0);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(1, "#ffffff00");
    g.fillStyle = grad;
    g.fillRect(-w, -h, w * 2, h * 2);
  }
  ctx.globalAlpha = m.opacity;
  ctx.drawImage(mask, 0, 0);
  ctx.restore();
}
