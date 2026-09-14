import { z } from "zod";
import type { Clip, Project } from "../projects/schema";
export const SequenceInstanceSchema = z.object({
  id: z.string(),
  sequenceId: z.string(),
  trackId: z.string(),
  start: z.number().nonnegative(),
  inPoint: z.number().nonnegative(),
  duration: z.number().positive(),
  speed: z.number().min(0.1).max(8),
});
export type SequenceInstance = z.infer<typeof SequenceInstanceSchema>;
export interface SequenceGraph {
  rootId: string;
  sequences: Record<string, { project: Project; nested: SequenceInstance[] }>;
}
export interface RenderNode {
  sequenceId: string;
  clip: Clip;
  time: number;
  parents: SequenceInstance[];
}
export function validateSequenceGraph(graph: SequenceGraph) {
  const visiting = new Set<string>(),
    done = new Set<string>();
  function visit(id: string, depth: number) {
    if (depth > 8)
      throw new Error("Nested sequences exceed the supported depth.");
    if (visiting.has(id))
      throw new Error("Circular sequence references are not allowed.");
    if (done.has(id)) return;
    const sequence = graph.sequences[id];
    if (!sequence) throw new Error("A referenced sequence is missing.");
    visiting.add(id);
    for (const child of sequence.nested) {
      SequenceInstanceSchema.parse(child);
      visit(child.sequenceId, depth + 1);
    }
    visiting.delete(id);
    done.add(id);
  }
  visit(graph.rootId, 0);
  return graph;
}
export function resolveSequenceAt(
  graph: SequenceGraph,
  time: number,
): RenderNode[] {
  validateSequenceGraph(graph);
  const result: RenderNode[] = [];
  function resolve(
    sequenceId: string,
    at: number,
    parents: SequenceInstance[],
  ) {
    const sequence = graph.sequences[sequenceId];
    for (const clip of sequence.project.clips)
      if (at >= clip.start && at < clip.start + clip.duration)
        result.push({ sequenceId, clip, time: at, parents });
    for (const instance of sequence.nested)
      if (at >= instance.start && at < instance.start + instance.duration)
        resolve(
          instance.sequenceId,
          instance.inPoint + (at - instance.start) * instance.speed,
          [...parents, instance],
        );
  }
  resolve(graph.rootId, time, []);
  return result;
}
export interface TrackingPoint {
  time: number;
  x: number;
  y: number;
  confidence: number;
}
export interface TrackingResult {
  clipId: string;
  points: TrackingPoint[];
  model: string;
}
export interface MulticamAngle {
  mediaId: string;
  offset: number;
  name: string;
}
export interface MulticamSequence {
  angles: MulticamAngle[];
  cuts: { time: number; angleIndex: number }[];
}
export function validateMulticam(c: MulticamSequence) {
  if (c.angles.length < 2)
    throw new Error("Multicam needs at least two angles.");
  for (const cut of c.cuts)
    if (cut.time < 0 || cut.angleIndex < 0 || cut.angleIndex >= c.angles.length)
      throw new Error("Invalid multicam cut.");
  return c;
}
