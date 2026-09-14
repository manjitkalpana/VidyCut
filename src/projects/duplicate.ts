import { id, type Project } from "./schema";
/** New IDs prevent cloud primary-key collisions while reusing immutable media blobs. */
export function duplicateProject(source: Project): Project {
  const project = structuredClone(source);
  project.id = id();
  project.name += " copy";
  project.modified = Date.now();
  const tracks = new Map(project.tracks.map((track) => [track.id, id()]));
  for (const track of project.tracks) track.id = tracks.get(track.id)!;
  for (const clip of project.clips) {
    clip.id = id();
    clip.trackId = tracks.get(clip.trackId)!;
    clip.keyframes.forEach((key) => (key.id = id()));
    clip.effects.forEach((effect) => (effect.id = id()));
  }
  project.markers.forEach((marker) => (marker.id = id()));
  return project;
}
