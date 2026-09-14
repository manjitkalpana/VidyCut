import { openDB } from "idb";
import { migrateProject, type Project } from "../projects/schema";
const db = () =>
  openDB("vidycut-studio", 1, {
    upgrade(db) {
      db.createObjectStore("projects", { keyPath: "id" });
      db.createObjectStore("media");
      db.createObjectStore("templates", { keyPath: "id" });
      db.createObjectStore("settings");
    },
  });
export async function saveProject(p: Project) {
  const d = await db();
  await d.put("projects", structuredClone(p));
  await d.put("settings", p.id, "last-project");
}
export async function loadLast() {
  const d = await db();
  const id = await d.get("settings", "last-project");
  return id
    ? ((await d.get("projects", id)) as Project | undefined)
    : undefined;
}
export async function listProjects() {
  return ((await (await db()).getAll("projects")) as Project[]).sort(
    (a, b) => b.modified - a.modified,
  );
}
export async function deleteProject(id: string) {
  await (await db()).delete("projects", id);
}
export async function putBlob(id: string, blob: Blob) {
  await (await db()).put("media", blob, id);
}
export async function getBlob(id: string): Promise<Blob | undefined> {
  return (await db()).get("media", id);
}
export async function removeBlob(id: string) {
  await (await db()).delete("media", id);
}
export async function saveTemplate(p: Project) {
  await (await db()).put("templates", structuredClone(p));
}
export async function listTemplates(): Promise<Project[]> {
  return (await db()).getAll("templates");
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function downloadProject(p: Project) {
  downloadBlob(
    new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }),
    p.name + ".vidycut.json",
  );
}
export async function importProject(file: File) {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Project files must be under 20 MB.");
  return migrateProject(JSON.parse(await file.text()));
}

/** Commit a restored project and all sources together; failures leave no partial restore. */
export async function commitPortableProject(
  project: Project,
  blobs: Map<string, Blob>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const database = await db();
  signal?.throwIfAborted();
  const transaction = database.transaction(
    ["projects", "media", "settings"],
    "readwrite",
  );
  const abort = () => {
    try {
      transaction.abort();
    } catch {
      /* Already committed or aborted. */
    }
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await Promise.all([
      ...[...blobs].map(([id, blob]) =>
        transaction.objectStore("media").put(blob, id),
      ),
      transaction.objectStore("projects").put(structuredClone(project)),
      transaction.objectStore("settings").put(project.id, "last-project"),
      transaction.done,
    ]);
  } catch {
    signal?.throwIfAborted();
    throw new Error(
      "The project could not be restored. Browser storage may be full. Your existing projects were not changed.",
    );
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
