import { create } from "zustand";
import {
  applyPatches,
  enablePatches,
  produceWithPatches,
  type Patch,
} from "immer";
import {
  newProject,
  id,
  newTrack,
  type Project,
  type Clip,
} from "../projects/schema";
import { applyOperation, type Operation } from "../timeline/operations";
enablePatches();
type History = { label: string; forward: Patch[]; inverse: Patch[] };
type State = {
  project: Project;
  selected: string | null;
  playhead: number;
  playing: boolean;
  rate: number;
  zoom: number;
  tool: string;
  tab: string;
  modal: string | null;
  snap: boolean;
  magnetic: boolean;
  clipboard: Clip | null;
  past: History[];
  future: History[];
  saveState: string;
  message: string;
  revision: number;
  mutate: (label: string, fn: (p: Project) => void) => void;
  dispatch: (op: Operation) => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  seek: (n: number) => void;
  notify: (message: string) => void;
  load: (p: Project) => void;
  addTrack: (kind: "video" | "audio") => string;
  copy: () => void;
  paste: () => void;
  set: (s: Partial<State>) => void;
};
export const useEditor = create<State>((set, get) => ({
  project: newProject(),
  selected: null,
  playhead: 0,
  playing: false,
  rate: 1,
  zoom: 65,
  tool: "Media",
  tab: "Video",
  modal: null,
  snap: true,
  magnetic: false,
  clipboard: null,
  past: [],
  future: [],
  saveState: "Saved",
  message: "",
  revision: 0,
  mutate: (label, fn) => {
    const [project, forward, inverse] = produceWithPatches(
      get().project,
      (p) => {
        fn(p);
      },
    );
    if (!forward.length) return;
    set((s) => ({
      project: { ...project, modified: Date.now() },
      past: [...s.past.slice(-199), { label, forward, inverse }],
      future: [],
      revision: s.revision + 1,
      saveState: "Saving…",
    }));
  },
  dispatch: (op) => get().mutate(op.type, (p) => applyOperation(p, op)),
  undo: () => {
    const s = get(),
      h = s.past.at(-1);
    if (!h) return;
    set({
      project: applyPatches(s.project, h.inverse),
      past: s.past.slice(0, -1),
      future: [h, ...s.future],
      revision: s.revision + 1,
      saveState: "Saving…",
    });
  },
  redo: () => {
    const s = get(),
      h = s.future[0];
    if (!h) return;
    set({
      project: applyPatches(s.project, h.forward),
      past: [...s.past, h],
      future: s.future.slice(1),
      revision: s.revision + 1,
      saveState: "Saving…",
    });
  },
  select: (selected) => set({ selected }),
  seek: (playhead) => set({ playhead: Math.max(0, playhead) }),
  notify: (message) => {
    set({ message });
    setTimeout(() => {
      if (get().message === message) set({ message: "" });
    }, 4500);
  },
  load: (project) =>
    set((s) => ({
      project,
      selected: null,
      playhead: 0,
      playing: false,
      past: [],
      future: [],
      revision: s.revision + 1,
    })),
  addTrack: (kind) => {
    const t = newTrack(
      kind,
      get().project.tracks.filter((t) => t.kind === kind).length + 1,
    );
    get().mutate("Add track", (p) => {
      if (kind === "video") p.tracks.unshift(t);
      else p.tracks.push(t);
    });
    return t.id;
  },
  copy: () => {
    const c = get().project.clips.find((c) => c.id === get().selected);
    if (c) set({ clipboard: structuredClone(c) });
  },
  paste: () => {
    const s = get();
    if (s.clipboard) {
      let trackId = s.clipboard.trackId;
      if (!s.project.tracks.find((t) => t.id === trackId))
        trackId = s.addTrack(s.clipboard.kind === "audio" ? "audio" : "video");
      const clip = {
        ...structuredClone(s.clipboard),
        id: id(),
        trackId,
        start: s.playhead,
      };
      s.dispatch({ type: "add", clip });
      set({ selected: clip.id });
    }
  },
  set: (s) => set(s),
}));
export const selectedClip = () => {
  const s = useEditor.getState();
  return s.project.clips.find((c) => c.id === s.selected);
};
