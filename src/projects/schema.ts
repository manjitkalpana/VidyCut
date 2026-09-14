import { z } from "zod";
export const id = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const TransformSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().min(0.01).max(20).default(1),
  rotation: z.number().default(0),
  width: z.number().min(1).default(1920),
  height: z.number().min(1).default(1080),
  anchorX: z.number().default(0.5),
  anchorY: z.number().default(0.5),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
});
export const KeyframeSchema = z.object({
  id: z.string(),
  path: z.string(),
  time: z.number().min(0),
  value: z.number(),
  easing: z
    .enum(["linear", "ease-in", "ease-out", "ease-in-out", "bezier"])
    .default("linear"),
  bezier: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
});
export const ClipSchema = z.object({
  id: z.string(),
  trackId: z.string(),
  mediaId: z.string().optional(),
  name: z.string().max(256),
  kind: z.enum([
    "video",
    "image",
    "audio",
    "text",
    "shape",
    "drawing",
    "adjustment",
  ]),
  start: z.number().min(0),
  duration: z.number().min(0.01),
  inPoint: z.number().min(0).default(0),
  speed: z.number().min(0.1).max(8).default(1),
  reverse: z.boolean().default(false),
  freeze: z.number().optional(),
  transform: TransformSchema.default({}),
  opacity: z.number().min(0).max(1).default(1),
  blend: z
    .enum([
      "source-over",
      "multiply",
      "screen",
      "overlay",
      "lighten",
      "darken",
      "difference",
      "color-dodge",
    ])
    .default("source-over"),
  radius: z.number().default(0),
  border: z.number().default(0),
  borderColor: z.string().default("#ffffff"),
  shadow: z.number().default(0),
  crop: z
    .object({
      left: z.number(),
      right: z.number(),
      top: z.number(),
      bottom: z.number(),
    })
    .default({ left: 0, right: 0, top: 0, bottom: 0 }),
  audio: z
    .object({
      volume: z.number().min(0).max(4).default(1),
      pan: z.number().min(-1).max(1).default(0),
      fadeIn: z.number().min(0).default(0),
      fadeOut: z.number().min(0).default(0),
      muted: z.boolean().default(false),
      normalize: z.boolean().default(false),
      denoise: z.boolean().default(false),
      enhance: z.boolean().default(false),
      duck: z.boolean().default(false),
    })
    .default({}),
  text: z
    .object({
      content: z.string().max(20000).default("Your story starts here"),
      font: z.string().default("Arial"),
      size: z.number().default(110),
      weight: z.number().default(700),
      italic: z.boolean().default(false),
      underline: z.boolean().default(false),
      align: z.enum(["left", "center", "right"]).default("center"),
      color: z.string().default("#ffffff"),
      gradient: z.string().default(""),
      stroke: z.number().default(0),
      strokeColor: z.string().default("#111111"),
      background: z.string().default(""),
      spacing: z.number().default(0),
      lineHeight: z.number().default(1.2),
      animation: z.string().default("none"),
    })
    .optional(),
  shape: z
    .object({
      type: z.string(),
      fill: z.string(),
      stroke: z.string().default("#ffffff"),
      strokeWidth: z.number().default(0),
      points: z.number().default(6),
    })
    .optional(),
  drawing: z
    .array(
      z.object({
        points: z.array(z.tuple([z.number(), z.number()])),
        color: z.string(),
        width: z.number(),
      }),
    )
    .optional(),
  effects: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        amount: z.number().default(0.5),
        enabled: z.boolean().default(true),
      }),
    )
    .default([]),
  grade: z.record(z.number()).default({}),
  filter: z.string().default("none"),
  filterIntensity: z.number().min(0).max(1).default(1),
  mask: z
    .object({
      type: z.enum(["none", "rectangle", "circle", "linear", "radial"]),
      x: z.number().default(0),
      y: z.number().default(0),
      scale: z.number().default(0.8),
      rotation: z.number().default(0),
      feather: z.number().default(0),
      invert: z.boolean().default(false),
      opacity: z.number().default(1),
    })
    .default({ type: "none" }),
  chroma: z
    .object({
      enabled: z.boolean().default(false),
      color: z.string().default("#00ff00"),
      tolerance: z.number().default(0.25),
      softness: z.number().default(0.1),
      spill: z.number().default(0.4),
    })
    .default({}),
  transition: z
    .object({
      type: z.string().default("none"),
      duration: z.number().default(0.5),
      direction: z.number().default(1),
      easing: z.string().default("ease-in-out"),
      intensity: z.number().default(1),
    })
    .default({}),
  keyframes: z.array(KeyframeSchema).default([]),
  groupId: z.string().optional(),
});
export const MediaSchema = z.object({
  id: z.string(),
  name: z.string().max(256),
  kind: z.enum(["video", "image", "audio"]),
  mime: z.string(),
  size: z.number().min(0),
  duration: z.number().min(0),
  width: z.number().default(0),
  height: z.number().default(0),
  fps: z.number().optional(),
  thumbnail: z.string().optional(),
  waveform: z.array(z.number()).optional(),
  favorite: z.boolean().default(false),
  folder: z.string().default(""),
  added: z.number(),
  builtin: z.string().optional(),
  storagePath: z.string().optional(),
  proxyId: z.string().optional(),
});
export const TrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["video", "audio"]),
  locked: z.boolean().default(false),
  muted: z.boolean().default(false),
  hidden: z.boolean().default(false),
  solo: z.boolean().default(false),
  height: z.number().min(38).max(180).default(68),
  volume: z.number().min(0).max(4).default(1),
  pan: z.number().min(-1).max(1).default(0),
});
export const ExportSchema = z.object({
  format: z.enum(["mp4", "webm", "mov"]).default("mp4"),
  resolution: z.enum(["480", "720", "1080", "1440", "2160"]).default("1080"),
  fps: z
    .union([
      z.literal(24),
      z.literal(25),
      z.literal(30),
      z.literal(50),
      z.literal(60),
    ])
    .default(30),
  bitrate: z.number().min(100000).max(150000000).default(8000000),
  audioBitrate: z
    .union([
      z.literal(128000),
      z.literal(192000),
      z.literal(256000),
      z.literal(320000),
    ])
    .default(192000),
});
export const ProjectSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  name: z.string().min(1).max(200),
  created: z.number(),
  modified: z.number(),
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(7680),
  fps: z.number().min(1).max(120),
  background: z.string().default("#111111"),
  tracks: z.array(TrackSchema).max(200),
  clips: z.array(ClipSchema).max(20000),
  media: z.array(MediaSchema).max(5000),
  markers: z
    .array(
      z.object({ id: z.string(), time: z.number().min(0), label: z.string() }),
    )
    .default([]),
  inPoint: z.number().min(0).optional(),
  outPoint: z.number().min(0).optional(),
  masterVolume: z.number().min(0).max(2).default(1),
  limiter: z.boolean().default(true),
  export: ExportSchema.default({}),
});
export type Project = z.infer<typeof ProjectSchema>;
export type Clip = z.infer<typeof ClipSchema>;
export type Media = z.infer<typeof MediaSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Keyframe = z.infer<typeof KeyframeSchema>;
export type ExportSettings = z.infer<typeof ExportSchema>;
export const newTrack = (kind: "video" | "audio", n = 1) =>
  TrackSchema.parse({
    id: id(),
    name: `${kind === "video" ? "V" : "A"}${n}`,
    kind,
  });
export function newProject(): Project {
  return ProjectSchema.parse({
    version: 1,
    id: id(),
    name: "Untitled project",
    created: Date.now(),
    modified: Date.now(),
    width: 1920,
    height: 1080,
    fps: 30,
    tracks: [newTrack("video"), newTrack("audio")],
    clips: [],
    media: [],
  });
}
export function newClip(
  kind: Clip["kind"],
  trackId: string,
  start = 0,
  extra: Partial<Clip> = {},
): Clip {
  return ClipSchema.parse({
    id: id(),
    trackId,
    kind,
    name:
      kind === "text"
        ? "Your story starts here"
        : kind === "shape"
          ? "Shape"
          : "Clip",
    start,
    duration: 5,
    ...extra,
  });
}
export const durationOf = (p: Project) =>
  Math.max(0.1, ...p.clips.map((c) => c.start + c.duration));
export function migrateProject(value: unknown): Project {
  if (!value || typeof value !== "object")
    throw new Error("This is not a VidyCut project.");
  const data = { ...value } as Record<string, unknown>;
  if (data.version === undefined || data.version === 0) data.version = 1;
  if (data.version !== 1)
    throw new Error("This project needs a newer version of VidyCut.");
  const p = ProjectSchema.parse(data);
  const trackIds = new Set(p.tracks.map((t) => t.id));
  if (
    trackIds.size !== p.tracks.length ||
    new Set(p.clips.map((c) => c.id)).size !== p.clips.length ||
    new Set(p.media.map((m) => m.id)).size !== p.media.length
  )
    throw new Error("The project contains duplicate identifiers.");
  if (p.clips.some((c) => !trackIds.has(c.trackId)))
    throw new Error("The project has a missing track.");
  return p;
}
export function dimensions(p: Project, resolution: string) {
  const short = Number(resolution);
  const ratio = p.width / p.height;
  return ratio >= 1
    ? { width: Math.round((short * ratio) / 2) * 2, height: short }
    : { width: short, height: Math.round(short / ratio / 2) * 2 };
}
