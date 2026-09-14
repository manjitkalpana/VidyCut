import { mediaBlob } from "./registry";
import { putBlob } from "../storage/local";
import type { Media } from "../projects/schema";
import { id } from "../projects/schema";
import { useEditor } from "../editor/store";
export async function createProxy(
  media: Media,
  onProgress: (n: number) => void,
  signal: AbortSignal,
) {
  if (media.kind !== "video") throw new Error("Only video clips need a proxy.");
  if (typeof VideoEncoder === "undefined")
    throw new Error(
      "Proxy generation needs WebCodecs. Use a current Chromium browser over HTTPS or localhost.",
    );
  const blob = await mediaBlob(media);
  if (!blob) throw new Error("Media file is missing.");
  const {
    Input,
    BlobSource,
    ALL_FORMATS,
    Output,
    WebMOutputFormat,
    BufferTarget,
    Conversion,
  } = await import("mediabunny");
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  const conversion = await Conversion.init({
    input,
    output,
    video: { width: 640, codec: "vp8", bitrate: 1200000 },
    audio: { discard: true },
  });
  const abort = () => void conversion.cancel();
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (!conversion.isValid)
      throw new Error(
        "This codec cannot be used to create a proxy in this browser.",
      );
    conversion.onProgress = onProgress;
    await conversion.execute();
    signal.throwIfAborted();
    const proxyId = id();
    await putBlob(
      proxyId,
      new Blob([target.buffer! as BlobPart], { type: "video/webm" }),
    );
    useEditor.getState().mutate("Use video proxy", (p) => {
      const m = p.media.find((x) => x.id === media.id);
      if (m) m.proxyId = proxyId;
    });
    return proxyId;
  } finally {
    signal.removeEventListener("abort", abort);
    input.dispose();
  }
}
