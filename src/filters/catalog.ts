export const filters = [
  { id: "none", name: "Original", category: "All", css: "" },
  {
    id: "coast",
    name: "Coast",
    category: "Cinematic",
    css: "saturate(.75) contrast(1.15) hue-rotate(-12deg)",
  },
  {
    id: "amber",
    name: "Amber",
    category: "Warm",
    css: "sepia(.32) saturate(1.25) contrast(1.06)",
  },
  {
    id: "arctic",
    name: "Arctic",
    category: "Cool",
    css: "saturate(.72) hue-rotate(18deg) brightness(1.08)",
  },
  {
    id: "analog",
    name: "Analog",
    category: "Vintage",
    css: "sepia(.5) contrast(.9) saturate(.8)",
  },
  {
    id: "silver",
    name: "Silver",
    category: "Black & White",
    css: "grayscale(1) contrast(1.2)",
  },
  {
    id: "forest",
    name: "Forest",
    category: "Nature",
    css: "saturate(1.4) contrast(1.08) hue-rotate(-8deg)",
  },
  {
    id: "velvet",
    name: "Velvet",
    category: "Portrait",
    css: "contrast(.92) brightness(1.08) saturate(.9)",
  },
  {
    id: "midnight",
    name: "Midnight",
    category: "Night",
    css: "brightness(.75) contrast(1.3) saturate(.7)",
  },
  {
    id: "chrome",
    name: "Chrome",
    category: "Social",
    css: "contrast(1.2) saturate(1.5)",
  },
  {
    id: "celluloid",
    name: "Celluloid",
    category: "Film",
    css: "sepia(.2) saturate(.75) contrast(1.1)",
  },
];
export const filterCSS = (filter: string) =>
  filters.find((f) => f.id === filter)?.css ?? "";
