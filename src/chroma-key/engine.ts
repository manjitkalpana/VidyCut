export function rgb(hex: string) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return match ? match.slice(1).map((v) => parseInt(v, 16)) : [0, 255, 0];
}
export function keyPixel(
  r: number,
  g: number,
  b: number,
  key: number[],
  tolerance: number,
  softness: number,
  spill: number,
) {
  const dist =
    Math.sqrt((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2) /
    441.673;
  const alpha = Math.max(
    0,
    Math.min(1, (dist - tolerance) / Math.max(0.001, softness)),
  );
  if (key[1] > key[0] && key[1] > key[2])
    g -= Math.max(0, g - Math.max(r, b)) * spill * (1 - alpha * 0.5);
  return [r, g, b, alpha];
}
