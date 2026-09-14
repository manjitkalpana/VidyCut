import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  play: "M8 5 19 12 8 19Z",
  pause: "M8 5v14M16 5v14",
  stop: "M6 6h12v12H6Z",
  media: "M3 6h7l2 2h9v12H3ZM3 6V4h7l2 2",
  audio:
    "M10 17V5l10-2v12M10 8l10-2M10 17c0 2-6 4-6 1s6-4 6-1ZM20 15c0 2-6 4-6 1s6-4 6-1Z",
  text: "M4 5h16M12 5v15M8 20h8",
  captions: "M3 5h18v14H3ZM10 9H7v6h3M17 9h-3v6h3",
  stickers: "M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9ZM8 14q4 5 8 0M8 9h.01M16 9h.01",
  effects: "M12 3v4M12 17v4M3 12h4M17 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3",
  filters: "M9 8a4 4 0 1 1 6 0M12 14a4 4 0 1 1-5-5M12 14a4 4 0 1 0 5-5",
  transitions: "M3 5v14l7-7ZM14 5v14M21 5v14l-7-7Z",
  templates: "M3 4h18v16H3ZM10 4v16M10 10h11",
  elements:
    "M3 3h6v6H3ZM18 3l4 6h-8ZM9 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM14 14h7v7h-7Z",
  ai: "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4",
  adjust: "M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M10 15v6",
  speed: "M4 18a9 9 0 1 1 16 0M12 13l5-6M9 20h6",
  animation: "M3 8h13v12H3ZM8 3h13v12",
  background: "M3 3h18v18H3ZM3 10l7-7M3 17 17 3M7 21 21 7M14 21l7-7",
  mask: "M4 4h16v16H4ZM18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z",
  chroma: "M12 3S4 11 4 16a8 8 0 0 0 16 0c0-5-8-13-8-13Z",
  import: "M12 3v12M7 10l5 5 5-5M4 15v6h16v-6",
  export: "M12 16V3M7 8l5-5 5 5M4 14v7h16v-7",
  save: "M5 3h12l4 4v14H3V3ZM7 3v6h10V3M7 21v-8h10v8",
  undo: "M9 5 4 10l5 5M4 10h11a5 5 0 0 1 0 10",
  redo: "M15 5l5 5-5 5M20 10H9a5 5 0 0 0 0 10",
  search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  settings:
    "M9 3h6l1 4 4 2v6l-4 2-1 4H9l-1-4-4-2V9l4-2ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  split:
    "M8 10 21 3M8 14l13 7M9 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  plus: "M12 4v16M4 12h16",
  minus: "M4 12h16",
  chevron: "M6 9l6 6 6-6",
  close: "M5 5l14 14M19 5 5 19",
  lock: "M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4",
  unlock: "M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0",
  eye: "M2 12q10-14 20 0-10 14-20 0ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  volume: "M3 9h4l5-5v16l-5-5H3ZM16 8q6 4 0 8M19 4q9 8 0 16",
  mute: "M3 9h4l5-5v16l-5-5H3ZM16 9l6 6M22 9l-6 6",
  fullscreen: "M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6",
  prev: "M5 5v14M19 5l-10 7 10 7Z",
  next: "M19 5v14M5 5l10 7-10 7Z",
  magnet: "M5 3v10a7 7 0 0 0 14 0V3h-5v10a2 2 0 0 1-4 0V3ZM5 8h5M14 8h5",
  grid: "M3 3h18v18H3ZM9 3v18M15 3v18M3 9h18M3 15h18",
  diamond: "M12 3l9 9-9 9-9-9Z",
  check: "M4 12l5 5L20 6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  copy: "M8 8h13v13H8ZM3 16V3h13",
  mic: "M9 5a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0ZM5 11v2a7 7 0 0 0 14 0v-2M12 20v3M8 23h8",
  screen: "M2 3h20v14H2ZM12 17v4M7 21h10",
  camera: "M3 6h12v13H3ZM15 10l6-4v13l-6-4",
  folder: "M3 6h7l2 2h9v12H3ZM3 6V4h7l2 2",
  star: "m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z",
  share:
    "M8 11l8-5M8 13l8 5M9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM22 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM22 20a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0",
  keyboard:
    "M2 5h20v14H2ZM5 9h2M10 9h2M15 9h2M19 9h.01M5 13h2M10 13h2M15 13h2M6 16h12",
  marker: "M6 3h12v11l-6 7-6-7Z",
  pen: "m4 16 12-12 4 4L8 20H4ZM14 6l4 4",
  film: "M4 3h16v18H4ZM8 3v18M16 3v18M4 8h4M4 16h4M16 8h4M16 16h4",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 6v6l4 3",
  cloud:
    "M6 19a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 0 1 0 12ZM12 11v10M8 15l4-4 4 4",
  reset: "M3 10a9 9 0 1 1 1 8M3 3v7h7",
  flip: "M12 3v18M3 7l6 5-6 5ZM21 7l-6 5 6 5Z",
  warning: "m12 3 10 18H2ZM12 9v5M12 17h.01",
};
export function Icon({
  name,
  size = 18,
  style,
  className = "",
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.effects} />
    </svg>
  );
}
