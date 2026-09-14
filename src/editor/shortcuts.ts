import { useEffect } from "react";
import { useEditor } from "./store";
import { clipAction } from "./commands";
import { saveProject } from "../storage/local";
import { durationOf } from "../projects/schema";
export const defaultShortcuts: Record<string, string> = {
  play: "Space",
  split: "S",
  delete: "Delete",
  undo: "Ctrl+Z",
  redo: "Ctrl+Shift+Z",
  copy: "Ctrl+C",
  paste: "Ctrl+V",
  save: "Ctrl+S",
  in: "I",
  out: "O",
  reverse: "J",
  stop: "K",
  forward: "L",
  previous: "ArrowLeft",
  next: "ArrowRight",
};
export function shortcuts() {
  try {
    return {
      ...defaultShortcuts,
      ...JSON.parse(localStorage.getItem("vidycut-shortcuts") ?? "{}"),
    };
  } catch {
    return defaultShortcuts;
  }
}
export function useShortcuts() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"]',
        ) ||
        useEditor.getState().modal
      )
        return;
      const s = useEditor.getState();
      const pressed = `${event.ctrlKey || event.metaKey ? "Ctrl+" : ""}${event.shiftKey ? "Shift+" : ""}${event.code === "Space" ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key}`;
      const action = Object.entries(shortcuts()).find(
        ([, key]) => key === pressed,
      )?.[0];
      if (!action) return;
      event.preventDefault();
      if (action === "play") s.set({ playing: !s.playing, rate: 1 });
      if (action === "split" || action === "delete") void clipAction(action);
      if (action === "undo") s.undo();
      if (action === "redo") s.redo();
      if (action === "copy") s.copy();
      if (action === "paste") s.paste();
      if (action === "save")
        void saveProject(s.project)
          .then(() => s.set({ saveState: "Saved" }))
          .catch(() =>
            s.notify("Project could not be saved. Download a project backup."),
          );
      if (action === "in")
        s.mutate("Mark in", (p) => {
          p.inPoint = s.playhead;
        });
      if (action === "out")
        s.mutate("Mark out", (p) => {
          p.outPoint = s.playhead;
        });
      if (action === "stop") s.set({ playing: false });
      if (action === "reverse") s.set({ playing: true, rate: -1 });
      if (action === "forward")
        s.set({ playing: true, rate: s.playing ? Math.min(4, s.rate * 2) : 1 });
      if (action === "previous" || action === "next")
        s.set({
          playing: false,
          playhead: Math.max(
            0,
            Math.min(
              durationOf(s.project),
              s.playhead + (action === "next" ? 1 : -1) / s.project.fps,
            ),
          ),
        });
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
}
