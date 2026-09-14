import type { FFmpeg } from "@ffmpeg/ffmpeg";
/** Prevent a failed worker script from leaving the export dialog waiting forever. */
export async function loadEncoder(encoder: FFmpeg, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      encoder.load(
        {
          classWorkerURL: new URL("/ffmpeg/worker.js", location.origin).href,
          coreURL: new URL("/ffmpeg/ffmpeg-core.js", location.origin).href,
          wasmURL: new URL("/ffmpeg/ffmpeg-core.wasm", location.origin).href,
        },
        { signal },
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Encoder initialization timed out.")),
          45000,
        );
      }),
    ]);
  } catch {
    encoder.terminate();
    signal?.throwIfAborted();
    throw new Error(
      "The local encoder could not start. Check that the encoder files are installed, then retry.",
    );
  } finally {
    clearTimeout(timer);
  }
}
