import type { Clip } from "../projects/schema";
export function drawText(
  ctx: CanvasRenderingContext2D,
  c: Clip,
  time: number,
  w: number,
  h: number,
  factor: number,
) {
  const t = c.text;
  if (!t) return;
  const local = Math.max(0, time - c.start);
  let content = t.content;
  const animation = t.animation;
  if (animation === "typewriter")
    content = content.slice(0, Math.floor(local * 22));
  ctx.save();
  ctx.translate(w / 2, h / 2);
  const entering = Math.min(1, local / 0.5);
  if (["fade", "slide"].includes(animation)) ctx.globalAlpha *= entering;
  if (animation === "slide") ctx.translate(0, (1 - entering) * h * 0.25);
  if (["pop", "zoom"].includes(animation)) {
    const scale =
      animation === "pop"
        ? Math.min(1.1, entering * 1.3) - (entering > 0.85 ? 0.1 : 0)
        : 0.6 + 0.4 * entering;
    ctx.scale(Math.max(0.01, scale), Math.max(0.01, scale));
  }
  if (animation === "bounce")
    ctx.translate(
      0,
      -Math.abs(Math.sin(local * 5)) * h * 0.09 * Math.max(0, 1 - local),
    );
  if (animation === "shake" || animation === "glitch")
    ctx.translate(
      Math.sin(local * 65) * 5 * factor,
      Math.cos(local * 80) * 3 * factor,
    );
  const size = t.size * factor;
  ctx.font = `${t.italic ? "italic " : ""}${t.weight} ${size}px "${t.font.replace(/["\\]/g, "")}", sans-serif`;
  ctx.textAlign = t.align;
  ctx.textBaseline = "middle";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${t.spacing * factor}px`;
  const lines = content.split("\n");
  const lineHeight = size * t.lineHeight;
  const x = t.align === "left" ? -w * 0.46 : t.align === "right" ? w * 0.46 : 0;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const y = (i - (lines.length - 1) / 2) * lineHeight;
    const tw = ctx.measureText(text).width;
    const left =
      t.align === "center" ? -tw / 2 : t.align === "right" ? x - tw : x;
    if (t.background) {
      ctx.fillStyle = t.background;
      ctx.fillRect(
        left - size * 0.16,
        y - size * 0.65,
        tw + size * 0.32,
        size * 1.3,
      );
    }
    ctx.fillStyle = t.color;
    if (t.gradient) {
      const g = ctx.createLinearGradient(-tw / 2, 0, tw / 2, 0);
      g.addColorStop(0, t.color);
      g.addColorStop(1, t.gradient);
      ctx.fillStyle = g;
    }
    if (animation === "neon") {
      ctx.shadowColor = t.color;
      ctx.shadowBlur = size * 0.3;
    }
    if (t.stroke) {
      ctx.strokeStyle = t.strokeColor;
      ctx.lineWidth = t.stroke * factor * 2;
      ctx.lineJoin = "round";
      ctx.strokeText(text, x, y);
    }
    ctx.fillText(text, x, y);
    if (t.underline) {
      ctx.fillStyle = t.color;
      ctx.fillRect(left, y + size * 0.45, tw, Math.max(1, size * 0.05));
    }
  }
  ctx.restore();
}
