import {
  Output,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  Mp4OutputFormat,
  WebMOutputFormat,
  canEncodeVideo,
  canEncodeAudio,
} from "mediabunny";
import { Renderer } from "../video-engine/renderer";
import { mixAudio } from "../audio-engine/engine";
import {
  durationOf,
  dimensions,
  ExportSchema,
  type Project,
  type ExportSettings,
} from "../projects/schema";
export type RenderProgress = {
  stage: string;
  progress: number;
  frames: number;
  total: number;
  speed: number;
  remaining: number;
  bytes: number;
};
export function validateExport(p: Project, settings: ExportSettings) {
  ExportSchema.parse(settings);
  if (!p.clips.length) throw new Error("Add a clip before exporting.");
  const from = p.inPoint ?? 0,
    to = Math.min(p.outPoint ?? durationOf(p), durationOf(p));
  if (to <= from) throw new Error("The out point must be after the in point.");
  return { from, duration: to - from, ...dimensions(p, settings.resolution) };
}
export async function exportProject(
  p: Project,
  settings: ExportSettings,
  onProgress: (p: RenderProgress) => void,
  signal: AbortSignal,
) {
  const range = validateExport(p, settings);
  const { from, duration, width, height } = range;
  if (typeof VideoEncoder === "undefined") {
    const { frameExport } = await import("./frames");
    return frameExport(p, settings, range, onProgress, signal);
  }
  const canMP4 =
    settings.format !== "webm" &&
    (await canEncodeVideo("avc", {
      width,
      height,
      bitrate: settings.bitrate,
    })) &&
    (await canEncodeAudio("aac", { sampleRate: 48000, numberOfChannels: 2 }));
  const codec = canMP4
    ? "avc"
    : (await canEncodeVideo("vp9", { width, height }))
      ? "vp9"
      : "vp8";
  if (
    !canMP4 &&
    (!(await canEncodeVideo(codec, { width, height })) ||
      !(await canEncodeAudio("opus", {
        sampleRate: 48000,
        numberOfChannels: 2,
      })))
  ) {
    const { frameExport } = await import("./frames");
    return frameExport(p, settings, range, onProgress, signal);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const target = new BufferTarget();
  const output = new Output({
    target,
    format: canMP4
      ? new Mp4OutputFormat({ fastStart: "in-memory" })
      : new WebMOutputFormat(),
  });
  const video = new CanvasSource(canvas, { codec, bitrate: settings.bitrate });
  output.addVideoTrack(video, { frameRate: settings.fps });
  const audio = new AudioBufferSource({
    codec: canMP4 ? "aac" : "opus",
    bitrate: settings.audioBitrate,
  });
  output.addAudioTrack(audio);
  const renderer = new Renderer();
  const total = Math.ceil(duration * settings.fps),
    started = performance.now();
  let audioAdded = 0;
  try {
    signal.throwIfAborted();
    await output.start();
    for (let i = 0; i < total; i++) {
      signal.throwIfAborted();
      const t = i / settings.fps;
      if (t >= audioAdded) {
        const length = Math.min(5, duration - audioAdded);
        const mixed = await mixAudio(p, from + audioAdded, length, signal);
        const buffer =
          mixed ??
          new AudioBuffer({
            length: Math.ceil(length * 48000),
            numberOfChannels: 2,
            sampleRate: 48000,
          });
        await audio.add(buffer);
        audioAdded += length;
      }
      await renderer.render(canvas, p, from + t, { exact: true });
      await video.add(t, Math.min(1 / settings.fps, duration - t));
      const elapsed = (performance.now() - started) / 1000;
      const speed = (i + 1) / Math.max(0.1, elapsed);
      onProgress({
        stage: "Rendering frames",
        progress:
          ((i + 1) / total) *
          (settings.format === "webm" || (canMP4 && settings.format === "mp4")
            ? 1
            : 0.85),
        frames: i + 1,
        total,
        speed,
        remaining: (total - i - 1) / Math.max(0.01, speed),
        bytes: Math.round(((settings.bitrate + settings.audioBitrate) * t) / 8),
      });
      if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    video.close();
    audio.close();
    await output.finalize();
    signal.throwIfAborted();
    let blob = new Blob([target.buffer! as BlobPart], {
      type: canMP4 ? "video/mp4" : "video/webm",
    });
    if ((settings.format === "mp4" && !canMP4) || settings.format === "mov") {
      const { transcode } = await import("./ffmpeg");
      blob = await transcode(
        blob,
        settings.format,
        (n) =>
          onProgress({
            stage: "Converting container",
            progress: 0.85 + n * 0.15,
            frames: total,
            total,
            speed: 0,
            remaining: 0,
            bytes: blob.size,
          }),
        signal,
      );
    }
    onProgress({
      stage: "Ready to download",
      progress: 1,
      frames: total,
      total,
      speed: total / ((performance.now() - started) / 1000),
      remaining: 0,
      bytes: blob.size,
    });
    return blob;
  } catch (e) {
    if (output.state !== "finalized" && output.state !== "canceled")
      await output.cancel();
    throw e;
  } finally {
    renderer.dispose();
  }
}
