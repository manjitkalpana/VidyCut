import { decodeMedia, analyzeMedia } from "../audio-engine/engine";
import { useEditor, selectedClip } from "../editor/store";
import { id, ClipSchema } from "../projects/schema";
import { mediaBlob } from "../media/registry";
export async function detectBeats() {
  const s = useEditor.getState(),
    c = selectedClip();
  const m = s.project.media.find((m) => m.id === c?.mediaId);
  if (!c || !m) throw new Error("Select a video or audio clip first.");
  const { beats } = await analyzeMedia(m);
  s.mutate("Add beat markers", (p) => {
    p.markers.push(
      ...beats
        .filter((t) => t >= c.inPoint && t <= c.inPoint + c.duration * c.speed)
        .map((t) => ({
          id: id(),
          time: c.start + (t - c.inPoint) / c.speed,
          label: "Beat",
        })),
    );
  });
  s.notify(`${beats.length} energy peaks detected`);
}
export async function removeSilence() {
  const s = useEditor.getState(),
    c = selectedClip();
  const m = s.project.media.find((m) => m.id === c?.mediaId);
  if (!c || !m) throw new Error("Select a video or audio clip first.");
  if (c.reverse) throw new Error("Turn off reverse before silence removal.");
  if (s.project.tracks.find((t) => t.id === c.trackId)?.locked)
    throw new Error("Unlock this track first.");
  const b = await decodeMedia(m),
    data = b.getChannelData(0),
    step = Math.round(b.sampleRate * 0.05);
  const ranges: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (
    let i = Math.floor(c.inPoint * b.sampleRate);
    i <
    Math.min(data.length, (c.inPoint + c.duration * c.speed) * b.sampleRate);
    i += step
  ) {
    let rms = 0;
    for (let j = i; j < Math.min(i + step, data.length); j++)
      rms += data[j] ** 2;
    const active = Math.sqrt(rms / step) > 0.018;
    if (active && start === null) start = i / b.sampleRate;
    if (!active && start !== null) {
      ranges.push({
        start: Math.max(c.inPoint, start - 0.06),
        end: Math.min(b.duration, i / b.sampleRate + 0.08),
      });
      start = null;
    }
  }
  if (start !== null)
    ranges.push({
      start,
      end: Math.min(b.duration, c.inPoint + c.duration * c.speed),
    });
  const merged: typeof ranges = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r.start - last.end < 0.2) last.end = r.end;
    else merged.push(r);
  }
  if (!merged.length)
    throw new Error("No speech-level audio was detected. The clip was kept.");
  s.mutate("Remove silent regions", (p) => {
    p.clips = p.clips.filter((x) => x.id !== c.id);
    let time = c.start;
    for (const r of merged) {
      const length = (r.end - r.start) / c.speed;
      p.clips.push(
        ClipSchema.parse({
          ...c,
          id: id(),
          start: time,
          inPoint: r.start,
          duration: length,
          keyframes: [],
        }),
      );
      time += length;
    }
    const removed = c.duration - (time - c.start);
    p.clips.forEach((x) => {
      if (x.trackId === c.trackId && x.start >= c.start + c.duration)
        x.start = Math.max(0, x.start - removed);
    });
  });
  s.notify(`Silence removed into ${merged.length} clips. Undo is available.`);
}
export async function detectScenes() {
  const s = useEditor.getState(),
    c = selectedClip();
  const m = s.project.media.find((m) => m.id === c?.mediaId);
  if (!c || !m || m.kind !== "video")
    throw new Error("Select a video clip first.");
  const blob = await mediaBlob(m);
  if (!blob) throw new Error("Media file is missing.");
  const { Input, BlobSource, ALL_FORMATS, CanvasSink } =
    await import("mediabunny");
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode()))
      throw new Error("Your browser cannot analyze this video codec.");
    const sink = new CanvasSink(track, { width: 64, height: 36, poolSize: 2 });
    const markers: { id: string; time: number; label: string }[] = [];
    let previous: Uint8ClampedArray | null = null;
    const step = 0.5 * c.speed;
    for (let t = c.inPoint; t < c.inPoint + c.duration * c.speed; t += step) {
      const frame = await sink.getCanvas(t);
      if (!frame) continue;
      const ctx = frame.canvas.getContext("2d") as
        CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) continue;
      const pixels = ctx.getImageData(0, 0, 64, 36).data;
      let difference = 0;
      if (previous) {
        for (let i = 0; i < pixels.length; i += 4)
          difference +=
            Math.abs(pixels[i] - previous[i]) +
            Math.abs(pixels[i + 1] - previous[i + 1]) +
            Math.abs(pixels[i + 2] - previous[i + 2]);
        difference /= 64 * 36 * 3;
        if (difference > 35)
          markers.push({
            id: id(),
            time: c.start + (t - c.inPoint) / c.speed,
            label: "Scene change",
          });
      }
      previous = pixels.slice();
    }
    s.mutate("Scene markers", (p) => {
      p.markers.push(...markers);
    });
    s.notify(`${markers.length} scene changes detected`);
  } finally {
    input.dispose();
  }
}
