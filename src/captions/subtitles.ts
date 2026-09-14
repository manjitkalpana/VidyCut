import { id, newClip, type Project, type Clip } from "../projects/schema";
export type Caption = {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: { start: number; end: number; text: string }[];
};
export function parseTime(v: string) {
  const parts = v.trim().replace(",", ".").split(":").map(Number);
  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
}
export function parseSubtitles(raw: string): Caption[] {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const lines = block.split("\n");
      const i = lines.findIndex((l) => l.includes("-->"));
      if (i < 0) return [];
      const [a, b] = lines[i].split("-->");
      const start = parseTime(a),
        end = parseTime(b.trim().split(/\s/)[0]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        return [];
      return [
        {
          id: id(),
          start,
          end,
          text: lines
            .slice(i + 1)
            .join("\n")
            .replace(/<[^>]*>/g, "")
            .trimEnd(),
        },
      ];
    });
}
export function subtitleTime(n: number, vtt = false) {
  const ms = Math.round(n * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${vtt ? "." : ","}${String(ms % 1000).padStart(3, "0")}`;
}
export function serializeSubtitles(captions: Caption[], vtt = false) {
  return (
    (vtt ? "WEBVTT\n\n" : "") +
    captions
      .sort((a, b) => a.start - b.start)
      .map(
        (c, i) =>
          `${vtt ? "" : `${i + 1}\n`}${subtitleTime(c.start, vtt)} --> ${subtitleTime(c.end, vtt)}\n${c.text}\n`,
      )
      .join("\n")
  );
}
export function captionClips(
  captions: Caption[],
  p: Project,
  trackId: string,
): Clip[] {
  return captions.map((c) =>
    newClip("text", trackId, c.start, {
      name: "Caption: " + c.text.slice(0, 32),
      duration: c.end - c.start,
      text: {
        content: c.text,
        font: "Arial",
        size: 62,
        weight: 700,
        italic: false,
        underline: false,
        align: "center",
        color: "#ffffff",
        gradient: "",
        stroke: 3,
        strokeColor: "#111111",
        background: "#000000aa",
        spacing: 0,
        lineHeight: 1.2,
        animation: "none",
      },
      transform: {
        x: 0,
        y: p.height * 0.34,
        scale: 1,
        rotation: 0,
        width: p.width * 0.88,
        height: 200,
        anchorX: 0.5,
        anchorY: 0.5,
        flipX: false,
        flipY: false,
      },
    }),
  );
}
