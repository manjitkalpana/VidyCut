import { useState } from "react";
import { useEditor } from "./store";
import { Modal } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Select, NumberField, Field } from "./controls";
import { defaultShortcuts, shortcuts } from "./shortcuts";
import { downloadProject } from "../storage/local";
export function SettingsModal() {
  const s = useEditor();
  const [keys, setKeys] = useState(shortcuts());
  return (
    <Modal
      open={s.modal === "settings" || s.modal === "shortcuts"}
      onClose={() => s.set({ modal: null })}
      title={
        s.modal === "shortcuts" ? "Keyboard shortcuts" : "Workspace settings"
      }
      description={
        s.modal === "shortcuts"
          ? "Click a shortcut and press a new key combination."
          : "Configure your project and keep a portable backup."
      }
    >
      <div className="modal-body">
        {s.modal === "settings" ? (
          <>
            <Field label="Project name">
              <input
                value={s.project.name}
                onChange={(e) =>
                  s.mutate("Rename project", (p) => {
                    p.name = e.target.value || "Untitled project";
                  })
                }
              />
            </Field>
            <div className="field-pair">
              <NumberField
                label="Canvas width"
                value={s.project.width}
                min={16}
                max={7680}
                step={2}
                onChange={(v) =>
                  s.mutate("Canvas width", (p) => {
                    p.width = Math.round(v / 2) * 2;
                  })
                }
              />
              <NumberField
                label="Canvas height"
                value={s.project.height}
                min={16}
                max={7680}
                step={2}
                onChange={(v) =>
                  s.mutate("Canvas height", (p) => {
                    p.height = Math.round(v / 2) * 2;
                  })
                }
              />
            </div>
            <Select
              label="Project frame rate"
              value={s.project.fps}
              options={[24, 25, 30, 50, 60]}
              onChange={(v) =>
                s.mutate("Project frame rate", (p) => {
                  p.fps = +v;
                })
              }
            />
            <p className="hint">
              Autosave stores the project and imported media in this browser.
              Export a JSON backup before clearing browser data. Keep your
              original media files.
            </p>
            <Button className="full" onClick={() => downloadProject(s.project)}>
              Download project backup
            </Button>
            <Button
              className="full"
              onClick={() => s.set({ modal: "shortcuts" })}
            >
              Customize keyboard shortcuts
            </Button>
            <Button className="full" onClick={() => s.set({ modal: "admin" })}>
              Administration
            </Button>
          </>
        ) : (
          <>
            <div className="shortcut-list">
              {Object.entries(keys).map(([name, key]) => (
                <label key={name}>
                  <span>{name.charAt(0).toUpperCase() + name.slice(1)}</span>
                  <input
                    aria-label={`${name} shortcut`}
                    value={key as string}
                    readOnly
                    onKeyDown={(e) => {
                      e.preventDefault();
                      if (["Control", "Meta", "Shift", "Alt"].includes(e.key))
                        return;
                      const key = `${e.ctrlKey || e.metaKey ? "Ctrl+" : ""}${e.shiftKey ? "Shift+" : ""}${e.code === "Space" ? "Space" : e.key.length === 1 ? e.key.toUpperCase() : e.key}`;
                      if (
                        Object.entries(keys).some(
                          ([k, v]) => k !== name && v === key,
                        )
                      ) {
                        s.notify("That shortcut is already assigned.");
                        return;
                      }
                      const next = { ...keys, [name]: key };
                      setKeys(next);
                      localStorage.setItem(
                        "vidycut-shortcuts",
                        JSON.stringify(next),
                      );
                    }}
                  />
                </label>
              ))}
            </div>
            <Button
              className="full"
              onClick={() => {
                setKeys(defaultShortcuts);
                localStorage.removeItem("vidycut-shortcuts");
              }}
            >
              Reset shortcuts
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
