import type { Clip, Media, Project } from "../projects/schema";
import { mediaBlob, mediaURL } from "../media/registry";
import { valueAt } from "../keyframes/interpolate";
import { sourceTime } from "../timeline/operations";
const decoded = new Map<string, AudioBuffer>();
let decodeContext: AudioContext | undefined;
export async function decodeMedia(m: Media) {
  if (decoded.has(m.id)) return decoded.get(m.id)!;
  const blob = await mediaBlob(m);
  if (!blob) throw new Error("Media file is missing.");
  decodeContext ??= new AudioContext();
  const buffer = await decodeContext.decodeAudioData(await blob.arrayBuffer());
  let bytes = 0;
  decoded.forEach((b) => (bytes += b.length * b.numberOfChannels * 4));
  if (bytes > 180 * 1024 * 1024) decoded.clear();
  decoded.set(m.id, buffer);
  return buffer;
}
export async function analyzeMedia(
  m: Media,
): Promise<{ wave: number[]; beats: number[] }> {
  const b = await decodeMedia(m);
  const samples = b.getChannelData(0).slice();
  const worker = new Worker(
    new URL("../media/waveform.worker.ts", import.meta.url),
    { type: "module" },
  );
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Audio analysis failed."));
    };
    worker.postMessage({ samples, bins: 400, sampleRate: b.sampleRate }, [
      samples.buffer,
    ]);
  });
}
export function audible(p: Project, c: Clip) {
  const track = p.tracks.find((t) => t.id === c.trackId);
  const solo = p.tracks.some((t) => t.solo);
  return (
    !!track &&
    !track.muted &&
    (!solo || track.solo) &&
    !c.audio.muted &&
    (c.kind === "audio" || c.kind === "video") &&
    c.freeze === undefined
  );
}
export function clipVolume(p: Project, c: Clip, t: number) {
  const tr = p.tracks.find((t) => t.id === c.trackId)!;
  let v =
    valueAt(c, "audio.volume", t, c.audio.volume) * tr.volume * p.masterVolume;
  const local = t - c.start;
  if (c.audio.fadeIn) v *= Math.min(1, Math.max(0, local / c.audio.fadeIn));
  if (c.audio.fadeOut)
    v *= Math.min(1, Math.max(0, (c.duration - local) / c.audio.fadeOut));
  if (
    c.audio.duck &&
    p.clips.some(
      (x) =>
        x.id !== c.id &&
        x.kind === "audio" &&
        !x.audio.duck &&
        t >= x.start &&
        t < x.start + x.duration &&
        audible(p, x),
    )
  )
    v *= 0.25;
  return v;
}
export class PreviewAudio {
  context: AudioContext | undefined;
  items = new Map<
    string,
    {
      el: HTMLMediaElement;
      gain: GainNode;
      pan: StereoPannerNode;
      filter: BiquadFilterNode;
      compressor: DynamicsCompressorNode;
    }
  >();
  loading = new Set<string>();
  revision = -1;
  async sync(p: Project, time: number, playing: boolean, rate: number) {
    if (!playing || rate < 0) {
      this.pause();
      return;
    }
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
    for (const c of p.clips) {
      if (
        !audible(p, c) ||
        time < c.start ||
        time >= c.start + c.duration ||
        c.reverse
      )
        continue;
      const m = p.media.find((m) => m.id === c.mediaId);
      if (!m) continue;
      const itemKey = c.id + ":" + m.id;
      let item = this.items.get(itemKey);
      if (!item && !this.loading.has(itemKey)) {
        this.loading.add(itemKey);
        try {
          const el = document.createElement("audio");
          el.src = await mediaURL(m);
          el.preload = "auto";
          const node = this.context.createMediaElementSource(el);
          const gain = this.context.createGain(),
            pan = this.context.createStereoPanner(),
            filter = this.context.createBiquadFilter(),
            compressor = this.context.createDynamicsCompressor();
          node
            .connect(filter)
            .connect(compressor)
            .connect(gain)
            .connect(pan)
            .connect(this.context.destination);
          item = { el, gain, pan, filter, compressor };
          this.items.set(itemKey, item);
        } finally {
          this.loading.delete(itemKey);
        }
      }
      if (item) {
        item.gain.gain.value = clipVolume(p, c, time);
        item.pan.pan.value = Math.max(
          -1,
          Math.min(
            1,
            c.audio.pan + (p.tracks.find((t) => t.id === c.trackId)?.pan ?? 0),
          ),
        );
        item.filter.type = "highpass";
        item.filter.frequency.value = c.audio.denoise ? 110 : 0;
        item.compressor.threshold.value = c.audio.enhance ? -24 : 0;
        item.compressor.ratio.value = c.audio.enhance ? 4 : 1;
        item.el.playbackRate = Math.max(0.1, Math.min(16, c.speed * rate));
        item.el.preservesPitch = false;
        const target = sourceTime(c, time);
        if (Math.abs(item.el.currentTime - target) > 0.16)
          item.el.currentTime = target;
        if (item.el.paused) void item.el.play().catch(() => {});
      }
    }
    for (const [clipId, item] of this.items) {
      const c = p.clips.find(
        (c) =>
          c.id === clipId.split(":")[0] && c.mediaId === clipId.split(":")[1],
      );
      if (
        !c ||
        !audible(p, c) ||
        time < c.start ||
        time >= c.start + c.duration ||
        c.reverse
      )
        item.el.pause();
    }
  }
  pause() {
    this.items.forEach((i) => i.el.pause());
  }
  dispose() {
    this.items.forEach((i) => {
      i.el.pause();
      i.el.removeAttribute("src");
      i.el.load();
      i.gain.disconnect();
      i.pan.disconnect();
    });
    this.items.clear();
    void this.context?.close();
  }
}
export async function mixAudio(
  p: Project,
  from: number,
  duration: number,
  signal?: AbortSignal,
): Promise<AudioBuffer | null> {
  const clips = p.clips.filter(
    (c) =>
      audible(p, c) && c.start < from + duration && c.start + c.duration > from,
  );
  if (!clips.length) return null;
  const sampleRate = 48000;
  const context = new OfflineAudioContext(
    2,
    Math.ceil(duration * sampleRate),
    sampleRate,
  );
  const master = context.createGain();
  master.gain.value = 1;
  if (p.limiter) {
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.06;
    master.connect(limiter).connect(context.destination);
  } else master.connect(context.destination);
  for (const c of clips) {
    signal?.throwIfAborted();
    const media = p.media.find((m) => m.id === c.mediaId);
    if (!media) continue;
    let buffer: AudioBuffer;
    try {
      buffer = await decodeMedia(media);
    } catch {
      if (c.kind === "audio")
        throw new Error("Audio could not be decoded: " + media.name);
      else continue;
    }
    const src = context.createBufferSource();
    if (c.reverse) {
      const reversed = context.createBuffer(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate,
      );
      for (let i = 0; i < buffer.numberOfChannels; i++)
        reversed.copyToChannel(buffer.getChannelData(i).slice().reverse(), i);
      src.buffer = reversed;
    } else src.buffer = buffer;
    src.playbackRate.value = c.speed;
    let normal = 1;
    if (c.audio.normalize) {
      let max = 0;
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const v = buffer.getChannelData(ch);
        for (let i = 0; i < v.length; i++) max = Math.max(max, Math.abs(v[i]));
      }
      normal = max > 0 ? 0.9 / max : 1;
    }
    const gain = context.createGain(),
      pan = context.createStereoPanner();
    pan.pan.value = Math.max(
      -1,
      Math.min(
        1,
        c.audio.pan + (p.tracks.find((t) => t.id === c.trackId)?.pan ?? 0),
      ),
    );
    const start = Math.max(from, c.start),
      end = Math.min(from + duration, c.start + c.duration);
    const values = new Float32Array(Math.max(2, Math.ceil((end - start) * 60)));
    for (let i = 0; i < values.length; i++)
      values[i] =
        clipVolume(p, c, start + ((end - start) * i) / (values.length - 1)) *
        normal;
    gain.gain.setValueCurveAtTime(
      values,
      start - from,
      Math.max(0.001, end - start),
    );
    let node: AudioNode = src;
    if (c.audio.denoise) {
      const filter = context.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 110;
      node.connect(filter);
      node = filter;
    }
    if (c.audio.enhance) {
      const comp = context.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.ratio.value = 4;
      node.connect(comp);
      node = comp;
    }
    node.connect(gain).connect(pan).connect(master);
    const off = c.reverse
      ? buffer.duration -
        (c.inPoint + c.duration * c.speed) +
        (start - c.start) * c.speed
      : c.inPoint + (start - c.start) * c.speed;
    if (off < buffer.duration)
      src.start(
        start - from,
        Math.max(0, off),
        Math.max(0, Math.min((end - start) * c.speed, buffer.duration - off)),
      );
  }
  return context.startRendering();
}
export function wavBlob(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels,
    length = buffer.length * channels * 2;
  const data = new ArrayBuffer(44 + length),
    view = new DataView(data);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, length, true);
  for (let i = 0; i < buffer.length; i++)
    for (let ch = 0; ch < channels; ch++)
      view.setInt16(
        44 + (i * channels + ch) * 2,
        Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i])) * 32767,
        true,
      );
  return new Blob([data], { type: "audio/wav" });
}
