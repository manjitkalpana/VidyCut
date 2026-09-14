import { newProject, id, newClip, ClipSchema } from "./schema";
import { inspectFile } from "../media/registry";
import { useEditor } from "../editor/store";
export async function loadSample() {
  const response = await fetch("/sample/coast.mp4");
  if (!response.ok)
    throw new Error(
      "The sample video could not be loaded. Import your own media instead.",
    );
  const media = await inspectFile(
    new File([await response.blob()], "Coast at first light.mp4", {
      type: "video/mp4",
    }),
  );
  const p = newProject();
  p.name = "Coast at first light";
  p.media = [media];
  p.clips = [
    newClip("video", p.tracks[0].id, 0, {
      mediaId: media.id,
      name: media.name,
      duration: 8,
      filter: "coast",
      transition: {
        type: "fade",
        duration: 0.6,
        direction: 1,
        easing: "ease-in-out",
        intensity: 1,
      },
    }),
  ];
  const tid = id();
  p.tracks.unshift({
    id: tid,
    name: "Titles",
    kind: "video",
    locked: false,
    muted: false,
    hidden: false,
    solo: false,
    height: 58,
    volume: 1,
    pan: 0,
  });
  p.clips.push(
    ClipSchema.parse({
      ...newClip("text", tid, 0.5),
      name: "Where the coast begins",
      duration: 6.5,
      text: {
        content: "Where the coast begins.",
        font: "Georgia",
        size: 112,
        weight: 400,
        animation: "fade",
      },
      transform: { x: 0, y: 160, width: 1750, height: 360 },
      keyframes: [
        { id: id(), path: "opacity", time: 0, value: 0, easing: "linear" },
        { id: id(), path: "opacity", time: 0.6, value: 1, easing: "ease-out" },
        { id: id(), path: "opacity", time: 5.9, value: 1, easing: "linear" },
        { id: id(), path: "opacity", time: 6.5, value: 0, easing: "ease-in" },
      ],
    }),
  );
  useEditor.getState().load(p);
  useEditor.getState().seek(2);
  useEditor.getState().select(p.clips[0].id);
}
