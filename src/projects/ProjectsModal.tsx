import {
  createProjectBundle,
  restoreProjectBundle,
  type BundleProgress,
} from "./bundle";
import { downloadBlob } from "../storage/local";
import { duplicateProject } from "./duplicate";
import { useState, useEffect, useRef } from "react";
import { useEditor } from "../editor/store";
import { newProject, type Project } from "./schema";
import {
  saveProject,
  listProjects,
  downloadProject,
  importProject,
} from "../storage/local";
import { Modal } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Icon } from "../components/Icon";
import { api, apiConfigured } from "../auth/client";
export function ProjectsModal() {
  const s = useEditor();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BundleProgress | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const backup = async () => {
    controller.current = new AbortController();
    setBusy(true);
    try {
      const project = structuredClone(useEditor.getState().project);
      const blob = await createProjectBundle(project, {
        signal: controller.current.signal,
        onProgress: setProgress,
      });
      downloadBlob(blob, project.name + ".vidycut.zip");
    } catch (e) {
      if (!controller.current.signal.aborted)
        s.notify(e instanceof Error ? e.message : "Backup failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void listProjects()
      .then(setProjects)
      .catch(() => s.notify("Local projects could not be loaded."));
  }, []);
  return (
    <Modal
      open={s.modal === "projects"}
      onClose={() => {
        controller.current?.abort();
        s.set({ modal: null });
      }}
      title="Your projects"
      description="Saved in this browser. Download backups to keep a portable copy."
      wide
    >
      <div className="modal-body">
        {progress && (
          <div role="status">
            {progress.stage} · {Math.round(progress.progress * 100)}%{" "}
            <Button onClick={() => controller.current?.abort()}>Cancel</Button>
          </div>
        )}
        <fieldset
          disabled={busy}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <div className="button-row">
            <Button
              variant="default"
              onClick={() => {
                void saveProject(s.project).then(() => {
                  s.load(newProject());
                  s.set({ modal: null });
                });
              }}
            >
              <Icon name="plus" />
              New project
            </Button>
            <Button onClick={() => input.current?.click()}>
              <Icon name="import" />
              Open JSON or backup
            </Button>
            <Button onClick={() => downloadProject(s.project)}>
              <Icon name="export" />
              Download JSON
            </Button>
            <Button onClick={() => void backup()}>
              Download backup with media
            </Button>
          </div>
          <p>
            Portable ZIP backups include source media. JSON files contain
            editing instructions only. Uploaded fonts must be installed
            separately.
          </p>
          <input
            ref={input}
            hidden
            type="file"
            accept=".json,.zip"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              e.target.value = "";
              controller.current = new AbortController();
              setBusy(true);
              try {
                await saveProject(useEditor.getState().project);
                s.load(
                  f.name.toLowerCase().endsWith(".zip")
                    ? await restoreProjectBundle(f, {
                        signal: controller.current.signal,
                        onProgress: setProgress,
                      })
                    : await importProject(f),
                );
                s.set({ modal: null });
              } catch (e) {
                if (!controller.current.signal.aborted)
                  s.notify(
                    e instanceof Error
                      ? e.message
                      : "This project could not be opened.",
                  );
              } finally {
                setBusy(false);
                setProgress(null);
              }
            }}
          />
          <div className="search-input">
            <Icon name="search" size={16} />
            <input
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="project-list">
            {projects
              .filter((p) =>
                p.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((p) => (
                <div className="project-row" key={p.id}>
                  <button
                    className="project-open"
                    onClick={() => {
                      s.load(p);
                      s.set({ modal: null });
                    }}
                  >
                    <Icon name="film" size={28} />
                    <div>
                      <strong>{p.name}</strong>
                      <span>
                        {p.clips.length} clips ·{" "}
                        {new Date(p.modified).toLocaleString()}
                      </span>
                    </div>
                  </button>
                  <Button
                    size="sm"
                    onClick={() => {
                      void saveProject(duplicateProject(p)).then(() =>
                        listProjects().then(setProjects),
                      );
                    }}
                  >
                    Duplicate
                  </Button>
                  <Button size="sm" onClick={() => downloadProject(p)}>
                    Download
                  </Button>
                </div>
              ))}
          </div>
          {!projects.length && (
            <p className="empty-message">
              Your project will appear after the first save.
            </p>
          )}
          {apiConfigured && (
            <Button
              onClick={async () => {
                try {
                  await api("/projects/" + s.project.id, {
                    method: "PUT",
                    body: JSON.stringify({ project: s.project }),
                  });
                  s.notify(
                    "Project JSON synced to your cloud account. Upload media separately in your deployment.",
                  );
                } catch (e) {
                  s.notify(
                    e instanceof Error ? e.message : "Cloud sync failed.",
                  );
                }
              }}
            >
              <Icon name="cloud" />
              Sync current project JSON
            </Button>
          )}
        </fieldset>
      </div>
    </Modal>
  );
}
