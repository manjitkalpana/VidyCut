import type { CanvasSink, Input } from "mediabunny";
import type { Project, Clip, Media } from "../projects/schema";
import { mediaImage, mediaURL, mediaBlob } from "../media/registry";
import { sourceTime } from "../timeline/operations";
import { evaluated } from "../keyframes/interpolate";
import { transitionState } from "../transitions/engine";
import { drawText } from "../text/render";
import { filterCSS } from "../filters/catalog";
import { applyMask } from "../masks/engine";
import { GpuPipeline } from "./gpu";
export class Renderer {
  gpu = new GpuPipeline();
  videos = new Map<string, HTMLVideoElement>();
  sinks = new Map<string, { input: Input; sink: CanvasSink }>();
  layer = document.createElement("canvas");
  filtered = document.createElement("canvas");
  previousActive = new Set<string>();
  async source(
    m: Media,
    c: Clip,
    time: number,
    exact: boolean,
    playing: boolean,
  ): Promise<CanvasImageSource> {
    if (m.kind === "image") return mediaImage(m);
    const t = Math.min(
      Math.max(0, sourceTime(c, time)),
      Math.max(0, m.duration - 0.00001),
    );
    if (exact && typeof VideoDecoder !== "undefined") {
      const { CanvasSink, Input, BlobSource, ALL_FORMATS } =
        await import("mediabunny");
      let item = this.sinks.get(m.id);
      if (!item) {
        const blob = await mediaBlob(m);
        if (!blob) throw new Error("Media file is missing.");
        const input = new Input({
          source: new BlobSource(blob),
          formats: ALL_FORMATS,
        });
        const track = await input.getPrimaryVideoTrack();
        if (track && (await track.canDecode())) {
          item = { input, sink: new CanvasSink(track, { poolSize: 2 }) };
          this.sinks.set(m.id, item);
        } else input.dispose();
      }
      if (item) {
        const result = await item.sink.getCanvas(t);
        if (result) return result.canvas;
      }
    }
    if (!exact && m.proxyId) m = { ...m, id: m.proxyId, proxyId: undefined };
    const videoKey = c.id + ":" + m.id + ":" + m.added;
    let v = this.videos.get(videoKey);
    if (!v) {
      v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.src = await mediaURL(m);
      await new Promise<void>((resolve, reject) => {
        const tm = setTimeout(
          () => reject(new Error("Video could not be loaded.")),
          15000,
        );
        v!.onloadeddata = () => {
          clearTimeout(tm);
          resolve();
        };
        v!.onerror = () => {
          clearTimeout(tm);
          reject(new Error("Video format is not supported."));
        };
      });
      this.videos.set(videoKey, v);
    }
    v.playbackRate = c.speed;
    const drift = Math.abs(v.currentTime - t);
    if (
      exact ||
      !playing ||
      c.reverse ||
      c.freeze !== undefined ||
      drift > 0.14
    ) {
      v.pause();
      if (drift > 0.0001) {
        v.currentTime = t;
        await new Promise<void>((resolve, reject) => {
          const tm = setTimeout(() => {
            v!.onseeked = null;
            reject(new Error("Video frame could not be decoded."));
          }, 10000);
          v!.onseeked = () => {
            clearTimeout(tm);
            resolve();
          };
        });
      }
    } else if (playing && v.paused) await v.play().catch(() => {});
    return v;
  }
  async render(
    canvas: HTMLCanvasElement,
    p: Project,
    time: number,
    options: { exact?: boolean; playing?: boolean; guides?: boolean } = {},
  ) {
    const ctx = canvas.getContext("2d")!;
    ctx.resetTransform();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = p.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const factor = canvas.width / p.width;
    const tracks = p.tracks
      .filter((t) => t.kind === "video" && !t.hidden)
      .reverse();
    const active = new Set<string>();
    for (const track of tracks) {
      const clips = p.clips
        .filter(
          (c) =>
            c.trackId === track.id &&
            time >= c.start &&
            time < c.start + c.duration,
        )
        .sort((a, b) => a.start - b.start);
      for (const original of clips) {
        active.add(original.id);
        const c = evaluated(original, time);
        const { transform: tr } = c;
        const w = Math.max(1, Math.round(tr.width * factor)),
          h = Math.max(1, Math.round(tr.height * factor));
        if (w > 8192 || h > 8192)
          throw new Error(
            "Layer dimensions exceed the GPU canvas size. Reduce layer width or height.",
          );
        this.layer.width = w;
        this.layer.height = h;
        const l = this.layer.getContext("2d")!;
        const fx = (type: string) =>
          c.effects.find((e) => e.type === type && e.enabled)?.amount ?? 0;
        if (c.kind === "text") drawText(l, c, time, w, h, factor);
        else if (c.kind === "shape") drawShape(l, c, w, h);
        else if (c.kind === "drawing") {
          for (const s of c.drawing ?? []) {
            l.beginPath();
            l.strokeStyle = s.color;
            l.lineWidth = s.width * factor;
            l.lineCap = "round";
            l.lineJoin = "round";
            s.points.forEach(([x, y], i) => {
              if (i === 0) l.moveTo(x * w, y * h);
              else l.lineTo(x * w, y * h);
            });
            l.stroke();
          }
        } else if (c.kind === "adjustment") l.drawImage(canvas, 0, 0, w, h);
        else {
          const media = p.media.find((m) => m.id === c.mediaId);
          if (!media) throw new Error("Media file is missing.");
          const source = await this.source(
            media,
            c,
            time,
            !!options.exact,
            !!options.playing,
          );
          const { left, right, top, bottom } = c.crop;
          const sw =
              source instanceof HTMLVideoElement
                ? source.videoWidth
                : source instanceof HTMLImageElement
                  ? source.naturalWidth
                  : "width" in source
                    ? Number(source.width)
                    : media.width || w,
            sh =
              source instanceof HTMLVideoElement
                ? source.videoHeight
                : source instanceof HTMLImageElement
                  ? source.naturalHeight
                  : "height" in source
                    ? Number(source.height)
                    : media.height || h;
          l.drawImage(
            source,
            sw * left,
            sh * top,
            Math.max(1, sw * (1 - left - right)),
            Math.max(1, sh * (1 - top - bottom)),
            0,
            0,
            w,
            h,
          );
        }
        const css = filterCSS(c.filter);
        if (css && c.filterIntensity > 0) {
          this.filtered.width = w;
          this.filtered.height = h;
          const f = this.filtered.getContext("2d")!;
          f.filter = css;
          f.drawImage(this.layer, 0, 0);
          l.globalAlpha = c.filterIntensity;
          l.drawImage(this.filtered, 0, 0);
          l.globalAlpha = 1;
        }
        const needsGpu =
          c.chroma.enabled ||
          Object.values(c.grade).some(Boolean) ||
          c.effects.some(
            (e) =>
              e.enabled &&
              e.amount > 0 &&
              !["blur", "shake", "zoom", "spin"].includes(e.type),
          );
        if (needsGpu) {
          const result = this.gpu.process(this.layer, c, time);
          l.clearRect(0, 0, w, h);
          l.drawImage(result, 0, 0);
        }
        if (c.radius) {
          l.save();
          l.globalCompositeOperation = "destination-in";
          l.beginPath();
          l.roundRect(0, 0, w, h, c.radius * factor);
          l.fill();
          l.restore();
        }
        applyMask(l, c, w, h);
        const trans = transitionState(c, time);
        ctx.save();
        ctx.globalAlpha = c.opacity * trans.opacity;
        ctx.globalCompositeOperation = c.blend;
        ctx.translate(
          canvas.width / 2 + (tr.x + trans.x) * factor,
          canvas.height / 2 + tr.y * factor,
        );
        ctx.rotate(
          ((tr.rotation + trans.rotation + fx("spin") * (time - c.start) * 90) *
            Math.PI) /
            180,
        );
        const zoom = 1 + fx("zoom") * (time - c.start) * 0.04;
        const scale = tr.scale * trans.scale * zoom;
        ctx.scale(scale * (tr.flipX ? -1 : 1), scale * (tr.flipY ? -1 : 1));
        ctx.translate((0.5 - tr.anchorX) * w, (0.5 - tr.anchorY) * h);
        if (fx("shake"))
          ctx.translate(
            Math.sin(time * 61) * fx("shake") * 18 * factor,
            Math.cos(time * 47) * fx("shake") * 14 * factor,
          );
        if (c.transition.type === "wipe") {
          ctx.beginPath();
          ctx.rect(-w / 2, -h / 2, w * trans.progress, h);
          ctx.clip();
        }
        ctx.filter = `blur(${(fx("blur") * 30 + trans.blur) * factor}px)`;
        if (c.shadow) {
          ctx.shadowColor = "#000000aa";
          ctx.shadowBlur = c.shadow * factor;
          ctx.shadowOffsetY = (c.shadow * factor) / 3;
        }
        ctx.drawImage(this.layer, -w / 2, -h / 2);
        ctx.shadowBlur = 0;
        ctx.filter = "none";
        if (c.border) {
          ctx.strokeStyle = c.borderColor;
          ctx.lineWidth = c.border * factor;
          ctx.strokeRect(-w / 2, -h / 2, w, h);
        }
        if (trans.flash) {
          ctx.fillStyle = `rgba(255,255,255,${trans.flash})`;
          ctx.fillRect(-w / 2, -h / 2, w, h);
        }
        if (c.transition.type === "light-leak" && trans.progress < 1) {
          ctx.globalAlpha *= 1 - trans.progress;
          const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
          g.addColorStop(0, "#ff7032");
          g.addColorStop(1, "#ffffaa00");
          ctx.fillStyle = g;
          ctx.fillRect(-w / 2, -h / 2, w, h);
        }
        if (c.transition.type === "glitch" && trans.progress < 1) {
          ctx.globalAlpha *= 0.3 * (1 - trans.progress);
          ctx.drawImage(this.layer, -w / 2 + Math.sin(time * 99) * 40, -h / 2);
        }
        ctx.restore();
      }
    }
    for (const [id, v] of this.videos)
      if (!active.has(id.split(":")[0]) || !options.playing) v.pause();
    if (options.guides) {
      ctx.save();
      ctx.strokeStyle = "#ffffff55";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        canvas.width * 0.05,
        canvas.height * 0.05,
        canvas.width * 0.9,
        canvas.height * 0.9,
      );
      for (const n of [1 / 3, 2 / 3]) {
        ctx.beginPath();
        ctx.moveTo(n * canvas.width, 0);
        ctx.lineTo(n * canvas.width, canvas.height);
        ctx.moveTo(0, n * canvas.height);
        ctx.lineTo(canvas.width, n * canvas.height);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  dispose() {
    this.videos.forEach((v) => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    });
    this.videos.clear();
    this.sinks.forEach((v) => v.input.dispose());
    this.sinks.clear();
    this.gpu.dispose();
  }
}
function drawShape(
  ctx: CanvasRenderingContext2D,
  c: Clip,
  w: number,
  h: number,
) {
  const s = c.shape;
  if (!s) return;
  ctx.fillStyle = s.fill;
  ctx.strokeStyle = s.stroke;
  ctx.lineWidth = s.strokeWidth;
  ctx.beginPath();
  if (s.type === "circle")
    ctx.ellipse(
      w / 2,
      h / 2,
      w / 2 - s.strokeWidth,
      h / 2 - s.strokeWidth,
      0,
      0,
      Math.PI * 2,
    );
  else if (s.type === "line" || s.type === "arrow") {
    ctx.moveTo(w * 0.08, h / 2);
    ctx.lineTo(w * 0.9, h / 2);
    if (s.type === "arrow") {
      ctx.moveTo(w * 0.65, h * 0.2);
      ctx.lineTo(w * 0.9, h / 2);
      ctx.lineTo(w * 0.65, h * 0.8);
    }
    ctx.lineWidth = Math.max(s.strokeWidth, 5);
    ctx.strokeStyle = s.fill;
    ctx.stroke();
    return;
  } else if (["triangle", "star", "polygon"].includes(s.type)) {
    const n = s.type === "triangle" ? 3 : s.type === "star" ? 10 : s.points;
    for (let i = 0; i < n; i++) {
      const r = s.type === "star" && i % 2 ? 0.22 : 0.48;
      const a = (i * Math.PI * 2) / n - Math.PI / 2;
      const x = w / 2 + Math.cos(a) * w * r,
        y = h / 2 + Math.sin(a) * h * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else ctx.roundRect(0, 0, w, h, c.radius);
  ctx.fill();
  if (s.strokeWidth) ctx.stroke();
}
