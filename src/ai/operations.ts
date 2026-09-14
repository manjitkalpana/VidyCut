import { z } from "zod";
import type { Project } from "../projects/schema";
import { applyOperation } from "../timeline/operations";
export const AssistantOperation = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("format"),
    width: z.number().int().min(16).max(7680),
    height: z.number().int().min(16).max(7680),
  }),
  z.object({
    type: z.literal("trim-project"),
    duration: z.number().min(0.1).max(86400),
  }),
  z.object({
    type: z.literal("open-tool"),
    tool: z.enum(["Captions", "Audio"]),
  }),
  z.object({
    type: z.literal("analyze"),
    task: z.enum(["silence", "beats", "scenes"]),
  }),
]);
export type AssistantOp = z.infer<typeof AssistantOperation>;
export function parseCommand(command: string): AssistantOp[] {
  const text = command.toLowerCase();
  const ops: AssistantOp[] = [];
  const seconds = text.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s\b)/);
  if (seconds && /(cut|trim|short|duration)/.test(text))
    ops.push({ type: "trim-project", duration: +seconds[1] });
  if (/vertical|tiktok|reels|shorts/.test(text))
    ops.push({ type: "format", width: 1080, height: 1920 });
  if (/square/.test(text))
    ops.push({ type: "format", width: 1080, height: 1080 });
  if (/horizontal|landscape|16:9/.test(text))
    ops.push({ type: "format", width: 1920, height: 1080 });
  if (/caption|subtitle/.test(text))
    ops.push({ type: "open-tool", tool: "Captions" });
  if (/music|background audio/.test(text))
    ops.push({ type: "open-tool", tool: "Audio" });
  if (/silen/.test(text)) ops.push({ type: "analyze", task: "silence" });
  if (/beat/.test(text)) ops.push({ type: "analyze", task: "beats" });
  if (/scene/.test(text)) ops.push({ type: "analyze", task: "scenes" });
  if (/tiktok.*short/.test(text) && !seconds)
    ops.push({ type: "trim-project", duration: 30 });
  return ops.map((o) => AssistantOperation.parse(o));
}
export function applyAssistantOperations(
  p: Project,
  operations: AssistantOp[],
) {
  for (const raw of operations) {
    const op = AssistantOperation.parse(raw);
    if (op.type === "format") {
      const sx = op.width / p.width,
        sy = op.height / p.height;
      for (const c of p.clips) {
        c.transform.x *= sx;
        c.transform.y *= sy;
      }
      p.width = op.width;
      p.height = op.height;
    }
    if (op.type === "trim-project") {
      for (const c of [...p.clips]) {
        if (c.start >= op.duration)
          applyOperation(p, { type: "delete", id: c.id });
        else if (c.start + c.duration > op.duration)
          applyOperation(p, {
            type: "trim",
            id: c.id,
            edge: "right",
            time: op.duration,
          });
      }
    }
  }
}
