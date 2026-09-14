import { loadEncoder } from "./load";
import { FFmpeg } from "@ffmpeg/ffmpeg";
export async function transcode(
  blob: Blob,
  format: "mp4" | "mov" | "webm",
  onProgress: (n: number) => void,
  signal?: AbortSignal,
) {
  const ffmpeg = new FFmpeg();
  const abort = () => ffmpeg.terminate();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await loadEncoder(ffmpeg, signal);
    ffmpeg.on("progress", ({ progress }) =>
      onProgress(Math.max(0, Math.min(1, progress))),
    );
    const ext = blob.type.includes("gif") ? "gif" : "webm";
    await ffmpeg.writeFile(
      "input." + ext,
      new Uint8Array(await blob.arrayBuffer()),
    );
    const args =
      format === "webm"
        ? ["-c:v", "libvpx", "-b:v", "3M", "-c:a", "libopus"]
        : [
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
          ];
    const status = await ffmpeg.exec([
      "-i",
      "input." + ext,
      ...args,
      "out." + format,
    ]);
    if (status !== 0) throw new Error("Export conversion failed. Try WebM.");
    const bytes = await ffmpeg.readFile("out." + format);
    if (typeof bytes === "string") throw new Error("Export conversion failed.");
    return new Blob([bytes as Uint8Array<ArrayBuffer>], {
      type: format === "mov" ? "video/quicktime" : `video/${format}`,
    });
  } finally {
    signal?.removeEventListener("abort", abort);
    ffmpeg.terminate();
  }
}
