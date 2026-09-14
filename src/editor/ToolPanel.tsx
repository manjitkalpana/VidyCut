import { useState, useRef, useEffect } from "react";
import { useEditor, selectedClip } from "./store";
import { MediaPanel } from "../media/MediaPanel";
import { CaptionsPanel } from "../captions/CaptionsPanel";
import { effects } from "../effects/catalog";
import { filters } from "../filters/catalog";
import { transitions } from "../transitions/engine";
import { Button } from "../components/ui/button";
import { Icon } from "../components/Icon";
import { addText, addShape } from "./commands";
import { id, newClip, ClipSchema, type Project } from "../projects/schema";
import { Section, SliderField, Select, NumberField, Field } from "./controls";
import { saveTemplate, listTemplates } from "../storage/local";
import {
  parseCommand,
  applyAssistantOperations,
  type AssistantOp,
} from "../ai/operations";
import { detectBeats, detectScenes, removeSilence } from "../ai/local-analysis";
export function ToolPanel() {
  const s = useEditor();
  const [search, setSearch] = useState("");
  const c = s.project.clips.find((c) => c.id === s.selected);
  const [width, setWidth] = useState(278);
  const addEffect = (type: string) => {
    if (!c) {
      s.notify("Select a video, image, or text clip first.");
      return;
    }
    s.dispatch({
      type: "update",
      id: c.id,
      changes: {
        effects: [...c.effects, { id: id(), type, amount: 0.4, enabled: true }],
      },
    });
  };
  return (
    <aside className="tool-panel" style={{ width }}>
      <header className="panel-heading">
        <h2>{s.tool}</h2>
        <button
          className="icon-button"
          title="Search the workspace"
          onClick={() => s.set({ modal: "search" })}
        >
          <Icon name="search" size={16} />
        </button>
      </header>
      <div className="tool-panel-scroll">
        {s.tool === "Media" || s.tool === "Audio" ? (
          <MediaPanel key={s.tool} audioOnly={s.tool === "Audio"} />
        ) : s.tool === "Captions" ? (
          <CaptionsPanel />
        ) : (
          <div className="panel-content">
            {[
              "Effects",
              "Filters",
              "Transitions",
              "Stickers",
              "Elements",
            ].includes(s.tool) && (
              <div className="search-input">
                <Icon name="search" size={15} />
                <input
                  aria-label={`Search ${s.tool.toLowerCase()}`}
                  placeholder={`Search ${s.tool.toLowerCase()}…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}
            {s.tool === "Effects" && (
              <>
                <p className="hint">
                  Choose a clip, then add an effect. Tune its intensity in the
                  inspector.
                </p>
                <div className="catalog-grid">
                  {effects
                    .filter((e) =>
                      e.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((e, i) => (
                      <button
                        className="catalog-card"
                        key={e.id}
                        onClick={() => addEffect(e.id)}
                      >
                        <div className={`effect-art effect-art-${i % 6}`}>
                          <Icon
                            name={
                              e.category === "Motion" ? "animation" : "effects"
                            }
                            size={30}
                          />
                          <span>{e.name.slice(0, 2).toUpperCase()}</span>
                        </div>
                        <strong>{e.name}</strong>
                        <small>{e.category}</small>
                      </button>
                    ))}
                </div>
              </>
            )}
            {s.tool === "Filters" && (
              <>
                <p className="hint">
                  Original color treatments for your footage.
                </p>
                <div className="catalog-grid">
                  {filters
                    .filter((f) =>
                      f.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((f) => (
                      <button
                        className={`catalog-card ${c?.filter === f.id ? "active" : ""}`}
                        key={f.id}
                        onClick={() => {
                          if (!c) {
                            s.notify("Select a visual clip first.");
                            return;
                          }
                          s.dispatch({
                            type: "update",
                            id: c.id,
                            changes: { filter: f.id },
                          });
                        }}
                      >
                        <img
                          src="/sample/coast.jpg"
                          alt=""
                          style={{ filter: f.css }}
                        />
                        <strong>{f.name}</strong>
                        <small>{f.category}</small>
                      </button>
                    ))}
                </div>
                {c && (
                  <SliderField
                    label="Filter intensity"
                    value={c.filterIntensity}
                    onChange={(v) =>
                      s.dispatch({
                        type: "update",
                        id: c.id,
                        changes: { filterIntensity: v },
                      })
                    }
                  />
                )}
              </>
            )}
            {s.tool === "Transitions" && (
              <>
                <p className="hint">
                  Transitions animate clip edges. Overlap clips on separate
                  tracks for a cross-dissolve.
                </p>
                <div className="catalog-grid">
                  {transitions
                    .filter((t) => t.includes(search.toLowerCase()))
                    .map((t) => (
                      <button
                        className={`catalog-card ${c?.transition.type === t ? "active" : ""}`}
                        key={t}
                        onClick={() => {
                          if (!c) {
                            s.notify("Select a visual clip first.");
                            return;
                          }
                          s.dispatch({
                            type: "update",
                            id: c.id,
                            changes: {
                              transition: { ...c.transition, type: t },
                            },
                          });
                        }}
                      >
                        <div className={`transition-art transition-${t}`}>
                          <span />
                          <span />
                        </div>
                        <strong>{t.replace("-", " ")}</strong>
                      </button>
                    ))}
                </div>
                {c && (
                  <>
                    <NumberField
                      label="Transition duration"
                      value={c.transition.duration}
                      min={0.05}
                      max={c.duration / 2}
                      step={0.05}
                      suffix="s"
                      onChange={(v) =>
                        s.dispatch({
                          type: "update",
                          id: c.id,
                          changes: {
                            transition: { ...c.transition, duration: v },
                          },
                        })
                      }
                    />
                    <Select
                      label="Direction"
                      value={c.transition.direction}
                      options={[
                        { value: "1", label: "From right" },
                        { value: "-1", label: "From left" },
                      ]}
                      onChange={(v) =>
                        s.dispatch({
                          type: "update",
                          id: c.id,
                          changes: {
                            transition: { ...c.transition, direction: +v },
                          },
                        })
                      }
                    />
                  </>
                )}
              </>
            )}
            {s.tool === "Text" && <TextPanel />}
            {(s.tool === "Elements" || s.tool === "Stickers") && (
              <>
                <div className="catalog-grid">
                  {[
                    "rectangle",
                    "circle",
                    "triangle",
                    "line",
                    "arrow",
                    "star",
                    "polygon",
                  ]
                    .filter((t) => t.includes(search.toLowerCase()))
                    .map((t, i) => (
                      <button
                        className="catalog-card"
                        key={t}
                        onClick={() =>
                          addShape(
                            t,
                            ["#79e6bd", "#cab4ff", "#ffb781", "#8bc8f5"][i % 4],
                          )
                        }
                      >
                        <div className="shape-art">
                          <Icon
                            name={
                              t === "star"
                                ? "star"
                                : t === "circle"
                                  ? "filters"
                                  : t === "arrow"
                                    ? "export"
                                    : "elements"
                            }
                            size={38}
                          />
                        </div>
                        <strong>{t}</strong>
                      </button>
                    ))}
                </div>
                {s.tool === "Stickers" && (
                  <div className="sticker-words">
                    {[
                      "GOOD VIBES",
                      "PLAY IT LOUD",
                      "NEW CHAPTER",
                      "MADE OF MOMENTS",
                      "YES!",
                      "LOOK HERE",
                    ].map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          addText(t);
                          const c = selectedClip();
                          if (c)
                            s.dispatch({
                              type: "update",
                              id: c.id,
                              changes: {
                                text: {
                                  ...c.text!,
                                  color: "#131820",
                                  background: "#79e6bd",
                                  size: 84,
                                  animation: "pop",
                                },
                              },
                            });
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {s.tool === "Elements" && (
                  <Button
                    className="full"
                    onClick={() => s.set({ modal: "drawing" })}
                  >
                    <Icon name="pen" />
                    Draw a layer
                  </Button>
                )}
              </>
            )}
            {s.tool === "Templates" && <TemplatePanel />}
            {s.tool === "AI Tools" && <AiPanel />}
            {s.tool === "Background" && (
              <>
                <p className="panel-intro">Set the scene.</p>
                <Field label="Canvas background">
                  <input
                    aria-label="Canvas background"
                    type="color"
                    value={s.project.background}
                    onChange={(e) =>
                      s.mutate("Change background", (p) => {
                        p.background = e.target.value;
                      })
                    }
                  />
                </Field>
                <div className="color-swatches">
                  {[
                    "#000000",
                    "#ffffff",
                    "#102d2a",
                    "#222a4a",
                    "#ffb496",
                    "#c2f0d5",
                    "#a4bed9",
                    "#e4d1f7",
                  ].map((color) => (
                    <button
                      key={color}
                      style={{ background: color }}
                      aria-label={`Background ${color}`}
                      onClick={() =>
                        s.mutate("Set background color", (p) => {
                          p.background = color;
                        })
                      }
                    />
                  ))}
                </div>
                <p className="hint">
                  Add an image or video to the lowest video track to use it as a
                  background.
                </p>
                <Button
                  className="full"
                  onClick={() => s.set({ tool: "Media" })}
                >
                  Choose background media
                </Button>
              </>
            )}
            {s.tool === "Speed" && <SpeedPanel />}
            {s.tool === "Animation" && <AnimationPanel />}
            {["Adjust", "Mask", "Chroma Key"].includes(s.tool) && (
              <>
                <div className="tool-explainer">
                  <Icon
                    name={
                      s.tool === "Adjust"
                        ? "adjust"
                        : s.tool === "Mask"
                          ? "mask"
                          : "chroma"
                    }
                    size={40}
                  />
                  <h3>
                    {s.tool === "Adjust"
                      ? "Find your color."
                      : s.tool === "Mask"
                        ? "Shape the frame."
                        : "Make room for a new scene."}
                  </h3>
                  <p>
                    {c
                      ? "Use the inspector on the right to adjust the selected clip."
                      : "Select a visual clip on the timeline to start."}
                  </p>
                </div>
                {s.tool === "Adjust" && (
                  <Button
                    className="full"
                    onClick={() => s.set({ tool: "Filters" })}
                  >
                    Explore original filters
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div
        className="panel-resizer"
        onPointerDown={(e) => {
          const x = e.clientX,
            w = width;
          const move = (ev: PointerEvent) =>
            setWidth(Math.max(235, Math.min(440, w + ev.clientX - x)));
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      />
    </aside>
  );
}
function TextPanel() {
  const upload = useRef<HTMLInputElement>(null);
  const s = useEditor();
  return (
    <>
      <Button className="full" variant="default" onClick={() => addText()}>
        <Icon name="plus" />
        Add text
      </Button>
      <div className="text-presets">
        <button onClick={() => addText("Your title here")}>
          <strong>Your title here</strong>
          <span>Clean headline</span>
        </button>
        <button
          className="text-preset-serif"
          onClick={() => {
            addText("A little more human.");
            const c = selectedClip();
            if (c)
              s.dispatch({
                type: "update",
                id: c.id,
                changes: { text: { ...c.text!, font: "Georgia", weight: 400 } },
              });
          }}
        >
          <em>A little more human.</em>
          <span>Editorial serif</span>
        </button>
        <button
          className="text-preset-label"
          onClick={() => {
            addText("THE NEXT CHAPTER");
            const c = selectedClip();
            if (c)
              s.dispatch({
                type: "update",
                id: c.id,
                changes: {
                  text: {
                    ...c.text!,
                    font: "Courier New",
                    spacing: 8,
                    size: 64,
                  },
                },
              });
          }}
        >
          <strong>THE NEXT CHAPTER</strong>
          <span>Wide tracking</span>
        </button>
        <button
          className="text-preset-neon"
          onClick={() => {
            addText("AFTER HOURS");
            const c = selectedClip();
            if (c)
              s.dispatch({
                type: "update",
                id: c.id,
                changes: {
                  text: { ...c.text!, color: "#79e6bd", animation: "neon" },
                },
              });
          }}
        >
          <strong>AFTER HOURS</strong>
          <span>Neon glow</span>
        </button>
      </div>
      <input
        ref={upload}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 10 * 1024 * 1024) {
            s.notify("Font file must be under 10 MB.");
            return;
          }
          try {
            const font = new FontFace(
              file.name.replace(/\.[^.]+$/, ""),
              await file.arrayBuffer(),
            );
            await font.load();
            document.fonts.add(font);
            const c = selectedClip();
            if (c?.text)
              s.dispatch({
                type: "update",
                id: c.id,
                changes: { text: { ...c.text, font: font.family } },
              });
            s.notify("Font loaded for this session.");
          } catch {
            s.notify("This font could not be loaded.");
          }
        }}
      />
      <Button className="full" onClick={() => upload.current?.click()}>
        <Icon name="import" />
        Upload font
      </Button>
      <p className="hint">
        Uploaded fonts are available for this session. Keep your font file with
        your project.
      </p>
    </>
  );
}
function SpeedPanel() {
  const s = useEditor(),
    c = selectedClip();
  const ramps: Record<string, number[]> = {
    Montage: [1, 2, 4, 2, 1],
    Hero: [1, 0.5, 0.25, 0.5, 1],
    Bullet: [2, 0.25, 0.25, 2, 4],
    "Jump Cut": [1, 4, 1, 4, 1],
  };
  return (
    <>
      <p className="panel-intro">Change the pace.</p>
      <p className="hint">
        Set a constant speed in the inspector, or apply a segmented speed ramp.
      </p>
      <div className="ramp-list">
        {Object.entries(ramps).map(([name, values]) => (
          <button
            key={name}
            onClick={() => {
              if (!c) {
                s.notify("Select a media clip first.");
                return;
              }
              if (c.reverse) {
                s.notify("Turn off reverse before applying a segmented ramp.");
                return;
              }
              s.mutate("Apply " + name + " ramp", (p) => {
                if (p.tracks.find((t) => t.id === c.trackId)?.locked) return;
                const sourceLength = c.duration * c.speed;
                const segment = sourceLength / values.length;
                let at = c.start;
                p.clips = p.clips.filter((x) => x.id !== c.id);
                values.forEach((speed, i) => {
                  const dur = segment / speed;
                  p.clips.push(
                    ClipSchema.parse({
                      ...c,
                      id: id(),
                      start: at,
                      inPoint: c.inPoint + i * segment,
                      speed,
                      duration: dur,
                      keyframes: [],
                    }),
                  );
                  at += dur;
                });
              });
            }}
          >
            <svg viewBox="0 0 180 44" aria-hidden="true">
              <polyline
                points={values
                  .map((v, i) => `${i * 42 + 6},${40 - v * 8}`)
                  .join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            <span>{name}</span>
          </button>
        ))}
      </div>
      <p className="hint">
        Each segment remains editable. Speed changes alter source timing;
        downstream clips keep their positions.
      </p>
    </>
  );
}
function AnimationPanel() {
  const s = useEditor();
  return (
    <>
      <p className="panel-intro">Give your story movement.</p>
      <div className="catalog-grid">
        {["Fade in", "Slide up", "Slow push", "Spin in", "Pulse"].map(
          (name, i) => (
            <button
              className="catalog-card"
              key={name}
              onClick={() => {
                const c = selectedClip();
                if (!c) {
                  s.notify("Select a clip first.");
                  return;
                }
                const end = Math.min(1, c.duration);
                const path = [
                  "opacity",
                  "transform.y",
                  "transform.scale",
                  "transform.rotation",
                  "transform.scale",
                ][i];
                const base = [
                  c.opacity,
                  c.transform.y,
                  c.transform.scale,
                  c.transform.rotation,
                  c.transform.scale,
                ][i];
                const start = [0, base + 200, 0.7, base - 90, base * 0.9][i];
                s.dispatch({
                  type: "update",
                  id: c.id,
                  changes: {
                    keyframes: [
                      ...c.keyframes.filter((k) => k.path !== path),
                      {
                        id: id(),
                        path,
                        time: 0,
                        value: start,
                        easing: "linear",
                      },
                      {
                        id: id(),
                        path,
                        time: end,
                        value: base,
                        easing: "ease-out",
                      },
                    ],
                  },
                });
              }}
            >
              <div className="effect-art">
                <Icon name="animation" size={28} />
              </div>
              <strong>{name}</strong>
            </button>
          ),
        )}
      </div>
      <p className="hint">
        Presets add editable keyframes. Adjust their values, timing, and easing
        in the inspector.
      </p>
    </>
  );
}
function TemplatePanel() {
  const s = useEditor();
  const [templates, setTemplates] = useState<Project[]>([]);
  useEffect(() => {
    void listTemplates().then(setTemplates);
  }, []);
  return (
    <>
      <p className="panel-intro">Start with your own style.</p>
      <Button
        className="full"
        onClick={() => {
          void saveTemplate(s.project).then(() =>
            listTemplates().then(setTemplates),
          );
          s.notify("Template saved locally");
        }}
      >
        <Icon name="save" />
        Save project as template
      </Button>
      <p className="hint">
        Templates store the project definition. Media stays in this browser and
        must be relinked on other devices.
      </p>
      <div className="template-list">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              s.load({
                ...structuredClone(t),
                id: id(),
                name: t.name + " copy",
                created: Date.now(),
                modified: Date.now(),
              });
            }}
          >
            <Icon name="templates" size={28} />
            <strong>{t.name}</strong>
            <small>
              {t.clips.length} layers · {t.width} × {t.height}
            </small>
            <span>Apply a copy</span>
          </button>
        ))}
      </div>
      {!templates.length && (
        <p className="empty-message">Your saved templates will appear here.</p>
      )}
      <Button
        className="full"
        onClick={() => {
          addText("A story worth telling.");
        }}
      >
        Add original title template
      </Button>
    </>
  );
}
function AiPanel() {
  const s = useEditor();
  const [command, setCommand] = useState(""),
    [ops, setOps] = useState<AssistantOp[]>([]),
    [busy, setBusy] = useState("");
  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      s.notify(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <div className="assistant-heading">
        <Icon name="ai" size={24} />
        <h3>Editing assistant</h3>
      </div>
      <p className="hint">
        Local command parser. Review the operations before applying them.
      </p>
      <textarea
        rows={3}
        placeholder="Make this vertical and cut to 30 seconds…"
        aria-label="Editing assistant command"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
      />
      <Button
        variant="default"
        className="full"
        onClick={() => {
          const parsed = parseCommand(command);
          setOps(parsed);
          if (!parsed.length)
            s.notify(
              "Try “make this vertical”, “cut to 30 seconds”, or “add captions”.",
            );
        }}
      >
        Preview operations
      </Button>
      {ops.length > 0 && (
        <div className="operation-plan">
          {ops.map((op, i) => (
            <p key={i}>
              {op.type === "format"
                ? `Set canvas to ${op.width} × ${op.height}`
                : op.type === "trim-project"
                  ? `Trim the project to ${op.duration} seconds`
                  : op.type === "open-tool"
                    ? `Open ${op.tool}`
                    : `Analyze ${op.task}`}
            </p>
          ))}
          <Button
            className="full"
            onClick={() => {
              s.mutate("Assistant edit", (p) =>
                applyAssistantOperations(p, ops),
              );
              for (const op of ops) {
                if (op.type === "open-tool") s.set({ tool: op.tool });
                if (op.type === "analyze")
                  void run(
                    op.task,
                    op.task === "beats"
                      ? detectBeats
                      : op.task === "silence"
                        ? removeSilence
                        : detectScenes,
                  );
              }
              setOps([]);
            }}
          >
            Apply operations
          </Button>
        </div>
      )}
      <Section title="Local analysis">
        {[
          ["beats", "Detect beat markers", detectBeats],
          ["silence", "Remove silent sections", removeSilence],
          ["scenes", "Detect scene changes", detectScenes],
        ].map(([key, label, fn]) => (
          <Button
            className="full"
            key={key as string}
            disabled={!!busy}
            onClick={() => void run(key as string, fn as () => Promise<void>)}
          >
            <Icon name="ai" size={16} />
            {busy === key ? "Analyzing…" : (label as string)}
          </Button>
        ))}
      </Section>
      <Section title="Model-powered tools">
        <p className="dependency-note">
          Whisper transcription is available with a configured server.
          Background removal, tracking, interpolation, and semantic highlights
          require model adapters; this build does not run those models.
        </p>
        <Button className="full" onClick={() => s.set({ tool: "Captions" })}>
          Caption providers
        </Button>
      </Section>
    </>
  );
}
