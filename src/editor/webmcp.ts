import { z } from "zod";
import { useEditor } from "./store";
import { applyAssistantOperations, AssistantOperation } from "../ai/operations";
import { saveProject } from "../storage/local";
interface Context {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean };
      execute: (input: unknown) => unknown | Promise<unknown>;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
}
export function registerEditorTools() {
  const context = (document as Document & { modelContext?: Context })
    .modelContext;
  if (!context?.registerTool) return () => {};
  const controller = new AbortController();
  const tools = [
    {
      name: "read_vidycut_project",
      title: "Read VidyCut project",
      description:
        "Read the current local project, clip timing, and selection. Does not read media bytes.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => {
        const s = useEditor.getState();
        return {
          name: s.project.name,
          width: s.project.width,
          height: s.project.height,
          tracks: s.project.tracks.map((t) => ({
            id: t.id,
            name: t.name,
            locked: t.locked,
          })),
          clips: s.project.clips.map((c) => ({
            id: c.id,
            name: c.name,
            start: c.start,
            duration: c.duration,
            trackId: c.trackId,
          })),
          selected: s.selected,
          playhead: s.playhead,
        };
      },
    },
    {
      name: "apply_vidycut_operations",
      title: "Apply VidyCut editing operations",
      description:
        "Change the current local canvas size or trim the timeline with validated operations. Changes support undo.",
      inputSchema: {
        type: "object",
        properties: {
          operations: {
            type: "array",
            items: {
              oneOf: [
                {
                  type: "object",
                  properties: {
                    type: { const: "format" },
                    width: { type: "integer" },
                    height: { type: "integer" },
                  },
                  required: ["type", "width", "height"],
                  additionalProperties: false,
                },
                {
                  type: "object",
                  properties: {
                    type: { const: "trim-project" },
                    duration: { type: "number" },
                  },
                  required: ["type", "duration"],
                  additionalProperties: false,
                },
              ],
            },
          },
        },
        required: ["operations"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input: unknown) => {
        const data = z
          .object({ operations: z.array(AssistantOperation).max(20) })
          .strict()
          .parse(input);
        if (
          data.operations.some(
            (op) => op.type !== "format" && op.type !== "trim-project",
          )
        )
          throw new Error(
            "Only timeline and format operations are accepted here.",
          );
        useEditor
          .getState()
          .mutate("Agent editing operations", (p) =>
            applyAssistantOperations(p, data.operations),
          );
        return { applied: data.operations.length };
      },
    },
    {
      name: "save_vidycut_project_locally",
      title: "Save current local project",
      description:
        "Save the current project in this browser. Does not upload or share any media.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async () => {
        await saveProject(useEditor.getState().project);
        useEditor.getState().set({ saveState: "Saved" });
        return { saved: true };
      },
    },
  ];
  for (const tool of tools)
    void Promise.resolve(
      context.registerTool(tool, { signal: controller.signal }),
    ).catch(() => {});
  return () => controller.abort();
}
