import { useEditor, selectedClip } from "./store";
import { id, newClip, ClipSchema } from "../projects/schema";
import { downloadProject, downloadBlob } from "../storage/local";
import { Renderer } from "../video-engine/renderer";
import { inspectFile } from "../media/registry";
import { mixAudio, wavBlob } from "../audio-engine/engine";
export async function clipAction(action: string) {
  const s = useEditor.getState(),
    c = selectedClip();
  if (action === "paste") {
    s.paste();
    return;
  }
  if (!c) return;
  if (action === "copy") s.copy();
  if (action === "cut") {
    s.copy();
    s.dispatch({ type: "delete", id: c.id });
  }
  if (action === "delete" || action === "ripple")
    s.dispatch({ type: "delete", id: c.id, ripple: action === "ripple" });
  if (action === "split")
    s.dispatch({ type: "split", id: c.id, time: s.playhead });
  if (action === "duplicate") s.dispatch({ type: "duplicate", id: c.id });
  if (action === "reverse")
    s.dispatch({ type: "update", id: c.id, changes: { reverse: !c.reverse } });
  if (action === "speed") s.set({ tool: "Speed" });
  if (action === "freeze") {
    const canvas = document.createElement("canvas");
    canvas.width = s.project.width;
    canvas.height = s.project.height;
    const renderer = new Renderer();
    try {
      await renderer.render(canvas, s.project, s.playhead, { exact: true });
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Frame capture failed."))),
          "image/png",
        ),
      );
      const file = new File([blob], `Frame ${s.playhead.toFixed(2)}.png`, {
        type: "image/png",
      });
      const media = await inspectFile(file);
      const trackId = s.addTrack("video");
      s.mutate("Freeze frame", (p) => {
        p.media.push(media);
        p.clips.push(
          newClip("image", trackId, s.playhead, {
            name: media.name,
            mediaId: media.id,
            duration: 3,
          }),
        );
      });
      s.notify("Freeze frame added to a new track");
    } finally {
      renderer.dispose();
    }
  }
  if (action === "detach" || action === "extract") {
    if (c.kind !== "video" && c.kind !== "audio") return;
    if (action === "extract") {
      const buffer = await mixAudio(
        { ...s.project, clips: [c] },
        c.start,
        c.duration,
      );
      if (buffer) downloadBlob(wavBlob(buffer), c.name + ".wav");
    } else {
      const trackId = s.addTrack("audio");
      s.mutate("Detach audio", (p) => {
        p.clips.push(
          ClipSchema.parse({
            ...c,
            id: id(),
            trackId,
            kind: "audio",
            name: c.name + " · audio",
            effects: [],
            keyframes: c.keyframes.filter((k) => k.path.startsWith("audio.")),
          }),
        );
        const source = p.clips.find((x) => x.id === c.id);
        if (source) source.audio.muted = true;
      });
    }
  }
}

export function addText(content = "Your story starts here") {
  const s = useEditor.getState();
  const trackId = s.addTrack("video");
  const clip = newClip("text", trackId, s.playhead, {
    name: content.slice(0, 40),
    text: ClipSchema.parse({ ...newClip("text", trackId), text: { content } })
      .text,
    transform: {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      width: s.project.width * 0.9,
      height: s.project.height * 0.4,
      anchorX: 0.5,
      anchorY: 0.5,
      flipX: false,
      flipY: false,
    },
  });
  s.dispatch({ type: "add", clip });
  s.select(clip.id);
  s.set({ tool: "Text" });
}
export function addShape(type: string, fill = "#75e8bd") {
  const s = useEditor.getState();
  const trackId = s.addTrack("video");
  const clip = newClip("shape", trackId, s.playhead, {
    name: type.charAt(0).toUpperCase() + type.slice(1),
    shape: { type, fill, stroke: "#ffffff", strokeWidth: 0, points: 6 },
    transform: {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      width: 360,
      height: 360,
      anchorX: 0.5,
      anchorY: 0.5,
      flipX: false,
      flipY: false,
    },
  });
  s.dispatch({ type: "add", clip });
  s.select(clip.id);
}
export function saveJSON() {
  downloadProject(useEditor.getState().project);
}
