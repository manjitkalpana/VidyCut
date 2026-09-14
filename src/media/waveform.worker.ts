self.onmessage = (
  e: MessageEvent<{ samples: Float32Array; bins: number; sampleRate: number }>,
) => {
  const { samples, bins, sampleRate } = e.data;
  const wave: number[] = [];
  const step = Math.max(1, Math.floor(samples.length / bins));
  for (let i = 0; i < bins; i++) {
    let sum = 0;
    for (let j = i * step; j < Math.min(samples.length, (i + 1) * step); j++)
      sum += samples[j] ** 2;
    wave.push(Math.sqrt(sum / step));
  }
  const beats: number[] = [];
  for (let i = 2; i < wave.length - 2; i++) {
    const avg = (wave[i - 2] + wave[i - 1] + wave[i + 1] + wave[i + 2]) / 4;
    if (
      wave[i] > avg * 1.5 &&
      wave[i] > 0.08 &&
      (beats.length === 0 ||
        (i * step) / sampleRate - beats[beats.length - 1] > 0.2)
    )
      beats.push((i * step) / sampleRate);
  }
  self.postMessage({ wave, beats });
};
