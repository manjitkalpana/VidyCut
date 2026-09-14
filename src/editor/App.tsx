import { registerEditorTools } from "./webmcp";
import { useEffect, useState, Suspense, lazy } from "react";
import { useEditor } from "./store";
import { TopBar } from "./TopBar";
import { ToolRail } from "./ToolRail";
import { ToolPanel } from "./ToolPanel";
import { Preview } from "./Preview";
import { Inspector } from "./Inspector";
import { Timeline } from "../timeline/Timeline";
import { loadLast, saveProject } from "../storage/local";
import { useShortcuts } from "./shortcuts";
import { importFiles, releaseAll } from "../media/registry";
import { migrateProject } from "../projects/schema";
const ExportModal = lazy(() =>
    import("../export/ExportModal").then((m) => ({ default: m.ExportModal })),
  ),
  ProjectsModal = lazy(() =>
    import("../projects/ProjectsModal").then((m) => ({
      default: m.ProjectsModal,
    })),
  ),
  SettingsModal = lazy(() =>
    import("./SettingsModal").then((m) => ({ default: m.SettingsModal })),
  ),
  MixerModal = lazy(() =>
    import("../audio-engine/MixerModal").then((m) => ({
      default: m.MixerModal,
    })),
  ),
  RecordingModal = lazy(() =>
    import("../media/RecordingModal").then((m) => ({
      default: m.RecordingModal,
    })),
  ),
  AuthModal = lazy(() =>
    import("../auth/AuthModal").then((m) => ({ default: m.AuthModal })),
  ),
  AdminModal = lazy(() =>
    import("../admin/AdminModal").then((m) => ({ default: m.AdminModal })),
  ),
  SearchModal = lazy(() =>
    import("./MoreModals").then((m) => ({ default: m.SearchModal })),
  ),
  DrawingModal = lazy(() =>
    import("./MoreModals").then((m) => ({ default: m.DrawingModal })),
  );
export function App() {
  const s = useEditor();
  const [ready, setReady] = useState(false);
  const [mobileView, setMobileView] = useState("edit");
  useShortcuts();
  useEffect(() => registerEditorTools(), []);
  useEffect(() => {
    let mounted = true;
    void loadLast()
      .then((p) => {
        if (p && mounted) useEditor.getState().load(migrateProject(p));
      })
      .catch(() =>
        useEditor
          .getState()
          .notify(
            "Your last project could not be restored. Import a JSON backup.",
          ),
      )
      .finally(() => setReady(true));
    const online = () =>
      useEditor
        .getState()
        .set({ saveState: navigator.onLine ? "Saved" : "Offline" });
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      mounted = false;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      releaseAll();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      const state = useEditor.getState(),
        rev = state.revision;
      void saveProject(state.project)
        .then(() => {
          if (useEditor.getState().revision === rev)
            useEditor
              .getState()
              .set({ saveState: navigator.onLine ? "Saved" : "Offline" });
        })
        .catch(() => {
          useEditor.getState().set({ saveState: "Save failed" });
          useEditor
            .getState()
            .notify(
              "Storage is full or unavailable. Download a project backup.",
            );
        });
    }, 700);
    return () => clearTimeout(timer);
  }, [s.revision, ready]);
  useEffect(() => {
    if (!ready) return;
    const unload = () => {
      void saveProject(useEditor.getState().project);
    };
    window.addEventListener("pagehide", unload);
    return () => window.removeEventListener("pagehide", unload);
  }, [ready]);
  return (
    <div
      className={`editor-app mobile-${mobileView}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length && !e.defaultPrevented) {
          e.preventDefault();
          void importFiles(e.dataTransfer.files);
        }
      }}
    >
      <TopBar />
      <div className="workspace">
        <ToolRail />
        <div className="editor-main">
          <div className="editor-upper">
            <ToolPanel />
            <Preview />
            <Inspector />
          </div>
          <Timeline />
        </div>
      </div>
      <div className="mobile-nav">
        <button
          className={mobileView === "edit" ? "active" : ""}
          onClick={() => setMobileView("edit")}
        >
          Edit
        </button>
        <button
          className={mobileView === "tools" ? "active" : ""}
          onClick={() => setMobileView("tools")}
        >
          Tools
        </button>
        <button
          className={mobileView === "inspect" ? "active" : ""}
          onClick={() => setMobileView("inspect")}
        >
          Inspector
        </button>
        <button onClick={() => s.set({ modal: "export" })}>Export</button>
      </div>
      {s.message && (
        <div role="status" className="toast">
          {s.message}
          <button
            aria-label="Dismiss notification"
            onClick={() => s.set({ message: "" })}
          >
            ×
          </button>
        </div>
      )}
      <Suspense
        fallback={
          <div className="loading-indicator" role="status">
            Loading panel…
          </div>
        }
      >
        {s.modal === "export" && <ExportModal />}
        {s.modal === "projects" && <ProjectsModal />}
        {(s.modal === "settings" || s.modal === "shortcuts") && (
          <SettingsModal />
        )}
        {s.modal === "mixer" && <MixerModal />}
        {s.modal === "record" && <RecordingModal />}
        {s.modal === "auth" && <AuthModal />}
        {s.modal === "admin" && <AdminModal />}
        {s.modal === "search" && <SearchModal />}
        {s.modal === "drawing" && <DrawingModal />}
      </Suspense>
    </div>
  );
}
