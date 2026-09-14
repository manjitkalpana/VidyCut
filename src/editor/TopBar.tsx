import { useRef } from "react";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui/button";
import { useEditor } from "./store";
import { importFiles } from "../media/registry";
import { saveProject, downloadProject } from "../storage/local";
export function TopBar() {
  const s = useEditor();
  const input = useRef<HTMLInputElement>(null);
  return (
    <header className="topbar">
      <button
        className="brand"
        onClick={() => s.set({ modal: "projects" })}
        title="Open projects"
      >
        <svg width="29" height="30" viewBox="0 0 32 32" aria-hidden="true">
          <path
            d="M5 4h5l8 15-3 7L3 7q-1-3 2-3ZM24 4h4q3 0 1 3L17 29q-2 3-5 0l-1-2L23 5q0-1 1-1Z"
            fill="currentColor"
          />
        </svg>
        <span>VidyCut</span>
      </button>
      <div className="project-title">
        <input
          aria-label="Project name"
          value={s.project.name}
          onChange={(e) =>
            s.mutate("Rename project", (p) => {
              p.name = e.target.value || "Untitled project";
            })
          }
        />
        <Icon name="pen" size={13} />
      </div>
      <div className="topbar-actions">
        <span className="autosave">
          <Icon name={s.saveState === "Saved" ? "check" : "clock"} size={13} />
          {s.saveState}
        </span>
        <Button
          variant="ghost"
          size="sm"
          title="Save (Ctrl+S)"
          onClick={() =>
            void saveProject(s.project)
              .then(() => s.set({ saveState: "Saved" }))
              .catch(() =>
                s.notify("Project could not be saved. Download a backup."),
              )
          }
        >
          <Icon name="save" size={16} />
          <span>Save</span>
        </Button>
        <i />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={!s.past.length}
          onClick={s.undo}
        >
          <Icon name="undo" size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          disabled={!s.future.length}
          onClick={s.redo}
        >
          <Icon name="redo" size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Record screen, webcam, or voice"
          onClick={() => s.set({ modal: "record" })}
        >
          <Icon name="camera" size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Share project JSON"
          onClick={() => {
            downloadProject(s.project);
            s.notify("Share this JSON together with the original media files.");
          }}
        >
          <Icon name="share" size={17} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Keyboard shortcuts"
          onClick={() => s.set({ modal: "shortcuts" })}
        >
          <Icon name="keyboard" size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Settings"
          onClick={() => s.set({ modal: "settings" })}
        >
          <Icon name="settings" size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Account"
          onClick={() => s.set({ modal: "auth" })}
        >
          <Icon name="user" size={18} />
        </Button>
        <input
          hidden
          ref={input}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button className="top-import" onClick={() => input.current?.click()}>
          <Icon name="folder" size={17} />
          <span>Import</span>
        </Button>
        <Button
          variant="default"
          className="top-export"
          onClick={() => s.set({ modal: "export", playing: false })}
        >
          <Icon name="export" size={17} />
          Export
        </Button>
      </div>
    </header>
  );
}
