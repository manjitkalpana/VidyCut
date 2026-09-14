import { loadEncoder } from "./load";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { Renderer } from "../video-engine/renderer";
import { mixAudio, wavBlob } from "../audio-engine/engine";
import type { Project, ExportSettings } from "../projects/schema";
import type { RenderProgress } from "./engine";

/** Frame-addressed fallback. Encoding runs in a worker; the clock never drops frames. */
export async function frameExport(
  project: Project,
  settings: ExportSettings,
  range: { from: number; duration: number; width: number; height: number },
  report: (progress: RenderProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const { from, duration, width, height } = range;
  const ffmpeg = new FFmpeg();
  if (import.meta.env.DEV)
    ffmpeg.on("log", ({ message }) =>
      console.debug("[VidyCut FFmpeg]", message),
    );
  const audioEncoder = new FFmpeg();
  if (import.meta.env.DEV)
    audioEncoder.on("log", ({ message }) =>
      console.debug("[VidyCut audio FFmpeg]", message),
    );
  const renderer = new Renderer();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const total = Math.ceil(duration * settings.fps);
  const batch = Math.max(
    1,
    Math.min(
      settings.fps,
      Math.floor((64 * 1024 * 1024) / (width * height * 4)),
    ),
  );
  const segments: string[] = [];
  const audioFiles: string[] = [];
  const started = performance.now();
  let frames = 0;
  const notify = (stage: string, progress: number, bytes = 0) => {
    const speed = frames / Math.max(0.1, (performance.now() - started) / 1000);
    report({
      stage,
      progress,
      frames,
      total,
      speed,
      remaining: speed ? (total - frames) / speed : 0,
      bytes,
    });
  };
  const abort = () => {
    ffmpeg.terminate();
    audioEncoder.terminate();
  };
  const exec = async (args: string[], encoder = ffmpeg) => {
    signal.throwIfAborted();
    const status = await encoder.exec([
      "-hide_banner",
      "-loglevel",
      import.meta.env.DEV ? "info" : "error",
      "-y",
      "-filter_threads",
      "1",
      "-filter_complex_threads",
      "1",
      "-threads",
      "1",
      ...args,
    ]);
    if (status !== 0)
      throw new Error(
        "FFmpeg could not encode this export. Try a lower resolution or another format.",
      );
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    notify("Loading local FFmpeg encoder", 0);
    await loadEncoder(ffmpeg, signal);
    for (let first = 0; first < total; first += batch) {
      const count = Math.min(batch, total - first);
      for (let i = 0; i < count; i++) {
        signal.throwIfAborted();
        await renderer.render(
          canvas,
          project,
          from + (first + i) / settings.fps,
          { exact: true },
        );
        const png = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) =>
              blob
                ? resolve(blob)
                : reject(
                    new Error("The browser could not capture this frame."),
                  ),
            "image/png",
          ),
        );
        await ffmpeg.writeFile(
          `frame-${String(i).padStart(4, "0")}.png`,
          new Uint8Array(await png.arrayBuffer()),
        );
        frames++;
        notify("Rendering every frame", (frames / total) * 0.75);
      }
      const segment = `segment-${segments.length}.${settings.format === "webm" ? "webm" : "mp4"}`;
      const codec =
        settings.format === "webm"
          ? [
              "-c:v",
              "libvpx",
              "-deadline",
              "realtime",
              "-cpu-used",
              "8",
              "-b:v",
              String(settings.bitrate),
            ]
          : [
              "-c:v",
              "libx264",
              "-preset",
              "ultrafast",
              "-b:v",
              String(settings.bitrate),
            ];
      notify("Encoding frame batch", (frames / total) * 0.75);
      await exec([
        "-framerate",
        String(settings.fps),
        "-i",
        "frame-%04d.png",
        "-frames:v",
        String(count),
        ...codec,
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "1",
        "-an",
        segment,
      ]);
      segments.push(segment);
      for (let i = 0; i < count; i++)
        await ffmpeg.deleteFile(`frame-${String(i).padStart(4, "0")}.png`);
    }
    await loadEncoder(audioEncoder, signal);
    // PCM segments concatenate before a single audio encode, avoiding per-segment encoder delay.
    for (let offset = 0; offset < duration; offset += 5) {
      signal.throwIfAborted();
      const length = Math.min(5, duration - offset);
      const audio =
        (await mixAudio(project, from + offset, length, signal)) ??
        new AudioBuffer({
          length: Math.ceil(length * 48000),
          sampleRate: 48000,
          numberOfChannels: 2,
        });
      const name = `audio-${audioFiles.length}.wav`;
      await audioEncoder.writeFile(
        name,
        new Uint8Array(await wavBlob(audio).arrayBuffer()),
      );
      audioFiles.push(name);
      notify("Mixing audio", 0.75 + ((offset + length) / duration) * 0.1);
    }
    const text = new TextEncoder();
    await audioEncoder.writeFile(
      "audio.txt",
      text.encode(audioFiles.map((name) => `file '${name}'`).join("\n")),
    );
    const audioName = settings.format === "webm" ? "audio.webm" : "audio.m4a";
    await exec(
      [
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "audio.txt",
        "-c:a",
        settings.format === "webm" ? "libvorbis" : "aac",
        "-b:a",
        String(settings.audioBitrate),
        "-t",
        String(duration),
        "-threads",
        "1",
        audioName,
      ],
      audioEncoder,
    );
    for (const name of audioFiles) await audioEncoder.deleteFile(name);
    const audioBytes = await audioEncoder.readFile(audioName);
    await ffmpeg.writeFile(audioName, audioBytes);
    audioEncoder.terminate();
    notify("Assembling video and audio", 0.9);
    await ffmpeg.writeFile(
      "video.txt",
      text.encode(segments.map((name) => `file '${name}'`).join("\n")),
    );
    const output = `output.${settings.format}`;
    await exec([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      "video.txt",
      "-i",
      audioName,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c",
      "copy",
      "-bsf:v",
      `setts=pts=N/(${settings.fps}*TB):dts=N/(${settings.fps}*TB):duration=1/(${settings.fps}*TB)`,
      "-t",
      String(duration),
      ...(settings.format === "webm" ? [] : ["-movflags", "+faststart"]),
      output,
    ]);
    signal.throwIfAborted();
    const bytes = await ffmpeg.readFile(output);
    if (typeof bytes === "string")
      throw new Error("The encoded video could not be read.");
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
      type:
        settings.format === "mov"
          ? "video/quicktime"
          : `video/${settings.format}`,
    });
    notify("Ready to download", 1, blob.size);
    return blob;
  } finally {
    signal.removeEventListener("abort", abort);
    renderer.dispose();
    ffmpeg.terminate();
    audioEncoder.terminate();
  }
}
