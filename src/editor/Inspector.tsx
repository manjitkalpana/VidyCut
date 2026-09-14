import { useState } from "react";
import { useEditor } from "./store";
import { id, ClipSchema, type Clip, type Keyframe } from "../projects/schema";
import {
  Section,
  NumberField,
  SliderField,
  Toggle,
  Select,
  Field,
} from "./controls";
import { Button } from "../components/ui/button";
import { Icon } from "../components/Icon";
import { clipAction } from "./commands";
import { valueAt } from "../keyframes/interpolate";
const percent = (n: number) => Math.round(n * 100) + "%";
export function Inspector() {
  const { project, selected, tool, playhead } = useEditor();
  const [tab, setTab] = useState("Basic");
  const c = project.clips.find((c) => c.id === selected);
  const mode = [
    "Adjust",
    "Mask",
    "Chroma Key",
    "Animation",
    "Speed",
    "Text",
  ].includes(tool)
    ? tool
    : tab;
  const update = (changes: Partial<Clip>) => {
    if (c) useEditor.getState().dispatch({ type: "update", id: c.id, changes });
  };
  const key = (path: string, value: number) => {
    if (!c) return;
    const time = Math.max(0, Math.min(c.duration, playhead - c.start));
    const existing = c.keyframes.find(
      (k) => k.path === path && Math.abs(k.time - time) < 1 / project.fps,
    );
    update({
      keyframes: existing
        ? c.keyframes.filter((k) => k.id !== existing.id)
        : [...c.keyframes, { id: id(), path, time, value, easing: "linear" }],
    });
  };
  const transform = (k: keyof Clip["transform"], n: number | boolean) =>
    c && update({ transform: { ...c.transform, [k]: n } });
  return (
    <aside className="inspector">
      <header className="panel-heading">
        <h2>
          {mode === "Basic" ? "Transform" : mode === "Video" ? "Video" : mode}
        </h2>
        {c && (
          <button
            className="icon-button"
            title="Reset clip settings"
            onClick={() => {
              const reset = ClipSchema.parse({
                id: c.id,
                trackId: c.trackId,
                kind: c.kind,
                name: c.name,
                start: c.start,
                duration: c.duration,
              });
              update({
                transform: {
                  ...reset.transform,
                  width: c.transform.width,
                  height: c.transform.height,
                },
                opacity: 1,
                grade: {},
                effects: [],
                filter: "none",
                keyframes: [],
              });
            }}
          >
            <Icon name="reset" size={16} />
          </button>
        )}
      </header>
      <div className="tabs inspector-tabs">
        {["Basic", "Video", "Audio", "Speed"].map((t) => (
          <button
            key={t}
            className={mode === t ? "active" : ""}
            onClick={() => {
              setTab(t);
              useEditor.getState().set({ tool: "Media" });
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="inspector-scroll">
        {!c ? (
          <div className="empty-inspector">
            <Icon name="adjust" size={30} />
            <h3>Your edit, your way.</h3>
            <p>
              Select a timeline clip to fine-tune its position, sound, and
              appearance.
            </p>
            <Section title="Project">
              <Select
                label="Format"
                value={`${project.width}:${project.height}`}
                options={[
                  { value: "1920:1080", label: "16:9 · YouTube" },
                  { value: "1080:1920", label: "9:16 · Reels / Shorts" },
                  { value: "1080:1080", label: "1:1 · Square" },
                  { value: "1080:1350", label: "4:5 · Portrait" },
                  { value: "1440:1080", label: "4:3 · Classic" },
                  { value: "1080:1440", label: "3:4 · Portrait" },
                ]}
                onChange={(v) => {
                  const [width, height] = v.split(":").map(Number);
                  useEditor.getState().mutate("Change format", (p) => {
                    p.width = width;
                    p.height = height;
                  });
                }}
              />
              <Select
                label="Frame rate"
                value={project.fps}
                options={[24, 25, 30, 50, 60]}
                onChange={(v) =>
                  useEditor.getState().mutate("Set frame rate", (p) => {
                    p.fps = +v;
                  })
                }
              />
            </Section>
          </div>
        ) : (
          <>
            <div className="selection-name">
              <Icon
                name={
                  c.kind === "text"
                    ? "text"
                    : c.kind === "audio"
                      ? "audio"
                      : "film"
                }
                size={14}
              />
              <input
                aria-label="Clip name"
                value={c.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </div>
            {(mode === "Basic" || mode === "Text") && (
              <>
                <Section title="Transform">
                  <SliderField
                    label="Scale"
                    value={valueAt(
                      c,
                      "transform.scale",
                      playhead,
                      c.transform.scale,
                    )}
                    onChange={(v) => transform("scale", v)}
                    min={0.05}
                    max={4}
                    format={percent}
                    onKeyframe={() => key("transform.scale", c.transform.scale)}
                    keyed={c.keyframes.some(
                      (k) => k.path === "transform.scale",
                    )}
                  />
                  <div className="field-pair">
                    <NumberField
                      label="Position X"
                      value={c.transform.x}
                      onChange={(v) => transform("x", v)}
                      onKeyframe={() => key("transform.x", c.transform.x)}
                    />
                    <NumberField
                      label="Position Y"
                      value={c.transform.y}
                      onChange={(v) => transform("y", v)}
                      onKeyframe={() => key("transform.y", c.transform.y)}
                    />
                  </div>
                  <div className="field-pair">
                    <NumberField
                      label="Width"
                      value={c.transform.width}
                      min={1}
                      max={7680}
                      onChange={(v) => transform("width", v)}
                    />
                    <NumberField
                      label="Height"
                      value={c.transform.height}
                      min={1}
                      max={7680}
                      onChange={(v) => transform("height", v)}
                    />
                  </div>
                  <SliderField
                    label="Rotation"
                    value={c.transform.rotation}
                    min={-180}
                    max={180}
                    step={1}
                    onChange={(v) => transform("rotation", v)}
                    format={(n) => `${Math.round(n)}°`}
                    onKeyframe={() =>
                      key("transform.rotation", c.transform.rotation)
                    }
                  />
                  <div className="field-pair">
                    <NumberField
                      label="Anchor X"
                      value={c.transform.anchorX}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={(v) => transform("anchorX", v)}
                    />
                    <NumberField
                      label="Anchor Y"
                      value={c.transform.anchorY}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={(v) => transform("anchorY", v)}
                    />
                  </div>
                  <div className="button-row">
                    <Button
                      size="sm"
                      onClick={() => transform("flipX", !c.transform.flipX)}
                    >
                      <Icon name="flip" size={14} />
                      Flip H
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => transform("flipY", !c.transform.flipY)}
                    >
                      <Icon
                        name="flip"
                        size={14}
                        style={{ transform: "rotate(90deg)" }}
                      />
                      Flip V
                    </Button>
                  </div>
                </Section>
                <Section title="Appearance">
                  <SliderField
                    label="Opacity"
                    value={valueAt(c, "opacity", playhead, c.opacity)}
                    onChange={(v) => update({ opacity: v })}
                    format={percent}
                    onKeyframe={() => key("opacity", c.opacity)}
                    keyed={c.keyframes.some((k) => k.path === "opacity")}
                  />
                  <Select
                    label="Blend mode"
                    value={c.blend}
                    options={[
                      "source-over",
                      "multiply",
                      "screen",
                      "overlay",
                      "lighten",
                      "darken",
                      "difference",
                      "color-dodge",
                    ]}
                    onChange={(v) => update({ blend: v as Clip["blend"] })}
                  />
                  <SliderField
                    label="Corner radius"
                    value={c.radius}
                    min={0}
                    max={300}
                    step={1}
                    onChange={(v) => update({ radius: v })}
                  />
                  <div className="field-pair">
                    <NumberField
                      label="Border"
                      value={c.border}
                      min={0}
                      max={100}
                      onChange={(v) => update({ border: v })}
                    />
                    <Field label="Border color">
                      <input
                        aria-label="Border color"
                        type="color"
                        value={c.borderColor}
                        onChange={(e) =>
                          update({ borderColor: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <SliderField
                    label="Shadow"
                    value={c.shadow}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) => update({ shadow: v })}
                  />
                </Section>
              </>
            )}
            {(mode === "Text" || mode === "Basic") && c.text && (
              <Section title="Text style">
                <textarea
                  aria-label="Text content"
                  rows={3}
                  value={c.text.content}
                  onChange={(e) =>
                    update({ text: { ...c.text!, content: e.target.value } })
                  }
                />
                <Select
                  label="Font"
                  value={c.text.font}
                  options={[
                    "Arial",
                    "Georgia",
                    "Verdana",
                    "Courier New",
                    "Times New Roman",
                    ...Array.from(document.fonts)
                      .map((f) => f.family)
                      .filter((f) => !["Arial", "Georgia"].includes(f)),
                  ]}
                  onChange={(v) => update({ text: { ...c.text!, font: v } })}
                />
                <div className="field-pair">
                  <NumberField
                    label="Font size"
                    value={c.text.size}
                    min={8}
                    max={600}
                    onChange={(v) => update({ text: { ...c.text!, size: v } })}
                    onKeyframe={() => key("text.size", c.text!.size)}
                  />
                  <Select
                    label="Weight"
                    value={c.text.weight}
                    options={[300, 400, 500, 600, 700, 800, 900]}
                    onChange={(v) =>
                      update({ text: { ...c.text!, weight: +v } })
                    }
                  />
                </div>
                <Select
                  label="Alignment"
                  value={c.text.align}
                  options={["left", "center", "right"]}
                  onChange={(v) =>
                    update({ text: { ...c.text!, align: v as "left" } })
                  }
                />
                <Toggle
                  label="Italic"
                  value={c.text.italic}
                  onChange={(v) => update({ text: { ...c.text!, italic: v } })}
                />
                <Toggle
                  label="Underline"
                  value={c.text.underline}
                  onChange={(v) =>
                    update({ text: { ...c.text!, underline: v } })
                  }
                />
                <div className="field-pair">
                  <Field label="Text color">
                    <input
                      aria-label="Text color"
                      type="color"
                      value={c.text.color}
                      onChange={(e) =>
                        update({ text: { ...c.text!, color: e.target.value } })
                      }
                    />
                  </Field>
                  <Field label="Gradient end">
                    <input
                      aria-label="Gradient end"
                      type="color"
                      value={c.text.gradient || c.text.color}
                      onChange={(e) =>
                        update({
                          text: { ...c.text!, gradient: e.target.value },
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="Text background">
                  <input
                    aria-label="Text background"
                    placeholder="Transparent"
                    value={c.text.background}
                    onChange={(e) =>
                      update({
                        text: { ...c.text!, background: e.target.value },
                      })
                    }
                  />
                </Field>
                <div className="field-pair">
                  <NumberField
                    label="Letter spacing"
                    value={c.text.spacing}
                    min={-10}
                    max={50}
                    onChange={(v) =>
                      update({ text: { ...c.text!, spacing: v } })
                    }
                  />
                  <NumberField
                    label="Line height"
                    value={c.text.lineHeight}
                    min={0.5}
                    max={3}
                    step={0.05}
                    onChange={(v) =>
                      update({ text: { ...c.text!, lineHeight: v } })
                    }
                  />
                </div>
                <div className="field-pair">
                  <NumberField
                    label="Text stroke"
                    value={c.text.stroke}
                    min={0}
                    max={20}
                    onChange={(v) =>
                      update({ text: { ...c.text!, stroke: v } })
                    }
                  />
                  <Field label="Stroke color">
                    <input
                      aria-label="Stroke color"
                      type="color"
                      value={c.text.strokeColor}
                      onChange={(e) =>
                        update({
                          text: { ...c.text!, strokeColor: e.target.value },
                        })
                      }
                    />
                  </Field>
                </div>
                <Select
                  label="Text animation"
                  value={c.text.animation}
                  options={[
                    "none",
                    "typewriter",
                    "pop",
                    "bounce",
                    "fade",
                    "slide",
                    "zoom",
                    "shake",
                    "glitch",
                    "neon",
                  ]}
                  onChange={(v) =>
                    update({ text: { ...c.text!, animation: v } })
                  }
                />
              </Section>
            )}
            {mode === "Basic" && c.shape && (
              <Section title="Shape">
                <Select
                  label="Shape type"
                  value={c.shape.type}
                  options={[
                    "rectangle",
                    "circle",
                    "triangle",
                    "line",
                    "arrow",
                    "star",
                    "polygon",
                  ]}
                  onChange={(v) => update({ shape: { ...c.shape!, type: v } })}
                />
                <Field label="Fill">
                  <input
                    aria-label="Shape fill"
                    type="color"
                    value={c.shape.fill}
                    onChange={(e) =>
                      update({ shape: { ...c.shape!, fill: e.target.value } })
                    }
                  />
                </Field>
                <NumberField
                  label="Stroke width"
                  value={c.shape.strokeWidth}
                  min={0}
                  max={50}
                  onChange={(v) =>
                    update({ shape: { ...c.shape!, strokeWidth: v } })
                  }
                />
                <NumberField
                  label="Polygon sides"
                  value={c.shape.points}
                  min={3}
                  max={20}
                  onChange={(v) =>
                    update({ shape: { ...c.shape!, points: Math.round(v) } })
                  }
                />
              </Section>
            )}
            {mode === "Video" && (
              <>
                <Section title="Timing">
                  <NumberField
                    label="Start"
                    value={c.start}
                    min={0}
                    step={1 / project.fps}
                    suffix="s"
                    onChange={(v) =>
                      useEditor
                        .getState()
                        .dispatch({ type: "move", id: c.id, start: v })
                    }
                  />
                  <NumberField
                    label="Duration"
                    value={c.duration}
                    min={1 / project.fps}
                    step={1 / project.fps}
                    suffix="s"
                    onChange={(v) =>
                      useEditor
                        .getState()
                        .dispatch({
                          type: "trim",
                          id: c.id,
                          edge: "right",
                          time: c.start + v,
                        })
                    }
                  />
                  <div className="button-row">
                    <Button size="sm" onClick={() => void clipAction("split")}>
                      <Icon name="split" size={14} />
                      Split
                    </Button>
                    <Button size="sm" onClick={() => void clipAction("freeze")}>
                      Freeze frame
                    </Button>
                  </div>
                </Section>
                <Section title="Crop">
                  {(["left", "right", "top", "bottom"] as const).map((k) => (
                    <SliderField
                      key={k}
                      label={`Crop ${k}`}
                      value={c.crop[k]}
                      max={0.45}
                      onChange={(v) => update({ crop: { ...c.crop, [k]: v } })}
                      format={percent}
                    />
                  ))}
                </Section>
              </>
            )}
            {mode === "Audio" && (
              <>
                <Section title="Audio">
                  <SliderField
                    label="Volume"
                    value={c.audio.volume}
                    max={2}
                    format={percent}
                    onChange={(v) =>
                      update({ audio: { ...c.audio, volume: v } })
                    }
                    onKeyframe={() => key("audio.volume", c.audio.volume)}
                  />
                  <SliderField
                    label="Pan"
                    value={c.audio.pan}
                    min={-1}
                    max={1}
                    onChange={(v) => update({ audio: { ...c.audio, pan: v } })}
                  />
                  <div className="field-pair">
                    <NumberField
                      label="Fade in"
                      value={c.audio.fadeIn}
                      min={0}
                      max={c.duration / 2}
                      step={0.1}
                      suffix="s"
                      onChange={(v) =>
                        update({ audio: { ...c.audio, fadeIn: v } })
                      }
                    />
                    <NumberField
                      label="Fade out"
                      value={c.audio.fadeOut}
                      min={0}
                      max={c.duration / 2}
                      step={0.1}
                      suffix="s"
                      onChange={(v) =>
                        update({ audio: { ...c.audio, fadeOut: v } })
                      }
                    />
                  </div>
                  {(
                    [
                      "muted",
                      "normalize",
                      "denoise",
                      "enhance",
                      "duck",
                    ] as const
                  ).map((k, i) => (
                    <Toggle
                      key={k}
                      label={
                        [
                          "Mute",
                          "Normalize on export",
                          "Reduce low-frequency noise",
                          "Voice compression",
                          "Duck under voice",
                        ][i]
                      }
                      value={c.audio[k]}
                      onChange={(v) =>
                        update({ audio: { ...c.audio, [k]: v } })
                      }
                    />
                  ))}
                </Section>
                <Button
                  className="full"
                  onClick={() => useEditor.getState().set({ modal: "mixer" })}
                >
                  Open audio mixer
                </Button>
              </>
            )}
            {mode === "Speed" && (
              <Section title="Playback speed">
                <Select
                  label="Speed"
                  value={c.speed}
                  options={[0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8]}
                  onChange={(v) =>
                    useEditor
                      .getState()
                      .dispatch({ type: "speed", id: c.id, speed: +v })
                  }
                />
                <NumberField
                  label="Custom speed"
                  value={c.speed}
                  min={0.1}
                  max={8}
                  step={0.05}
                  suffix="×"
                  onChange={(v) =>
                    useEditor
                      .getState()
                      .dispatch({ type: "speed", id: c.id, speed: v })
                  }
                />
                <Toggle
                  label="Reverse video"
                  value={c.reverse}
                  onChange={(v) => update({ reverse: v })}
                />
                <p className="hint">
                  Speed changes also change audio pitch. Reverse audio is
                  included in exports.
                </p>
                <Button
                  className="full"
                  onClick={() => void clipAction("freeze")}
                >
                  Insert freeze frame
                </Button>
              </Section>
            )}
            {mode === "Adjust" && (
              <>
                <Section title="Color">
                  <Button size="sm" onClick={() => update({ grade: {} })}>
                    Reset color
                  </Button>
                  {[
                    "exposure",
                    "brightness",
                    "contrast",
                    "highlights",
                    "shadows",
                    "whites",
                    "blacks",
                    "saturation",
                    "temperature",
                    "tint",
                    "fade",
                    "sharpen",
                    "vignette",
                  ].map((k) => (
                    <SliderField
                      key={k}
                      label={k.charAt(0).toUpperCase() + k.slice(1)}
                      value={c.grade[k] ?? 0}
                      min={
                        ["fade", "sharpen", "vignette"].includes(k)
                          ? 0
                          : k === "exposure"
                            ? -3
                            : -1
                      }
                      max={k === "exposure" ? 3 : 1}
                      onChange={(v) =>
                        update({ grade: { ...c.grade, [k]: v } })
                      }
                      onKeyframe={() => key(`grade.${k}`, c.grade[k] ?? 0)}
                    />
                  ))}
                </Section>
                <Section title="RGB gamma & hue">
                  {["curveR", "curveG", "curveB", "hue"].map((k, i) => (
                    <SliderField
                      key={k}
                      label={
                        [
                          "Red gamma",
                          "Green gamma",
                          "Blue gamma",
                          "Hue rotation",
                        ][i]
                      }
                      value={c.grade[k] ?? 0}
                      min={-0.9}
                      max={0.9}
                      onChange={(v) =>
                        update({ grade: { ...c.grade, [k]: v } })
                      }
                    />
                  ))}
                </Section>
              </>
            )}
            {mode === "Mask" && (
              <Section title="Mask">
                <Select
                  label="Mask shape"
                  value={c.mask.type}
                  options={["none", "rectangle", "circle", "linear", "radial"]}
                  onChange={(v) =>
                    update({
                      mask: { ...c.mask, type: v as Clip["mask"]["type"] },
                    })
                  }
                />
                {(
                  ["x", "y", "scale", "rotation", "feather", "opacity"] as const
                ).map((k) => (
                  <SliderField
                    key={k}
                    label={`Mask ${k}`}
                    value={c.mask[k]}
                    min={
                      ["x", "y"].includes(k)
                        ? -0.5
                        : k === "rotation"
                          ? -180
                          : 0
                    }
                    max={k === "rotation" ? 180 : k === "feather" ? 20 : 1}
                    step={k === "rotation" ? 1 : 0.01}
                    onChange={(v) => update({ mask: { ...c.mask, [k]: v } })}
                    onKeyframe={() => key(`mask.${k}`, c.mask[k])}
                  />
                ))}
                <Toggle
                  label="Invert mask"
                  value={c.mask.invert}
                  onChange={(v) => update({ mask: { ...c.mask, invert: v } })}
                />
              </Section>
            )}
            {mode === "Chroma Key" && (
              <Section title="Chroma key">
                <Toggle
                  label="Enable chroma key"
                  value={c.chroma.enabled}
                  onChange={(v) =>
                    update({ chroma: { ...c.chroma, enabled: v } })
                  }
                />
                <Field label="Key color">
                  <input
                    aria-label="Key color"
                    type="color"
                    value={c.chroma.color}
                    onChange={(e) =>
                      update({ chroma: { ...c.chroma, color: e.target.value } })
                    }
                  />
                </Field>
                {(["tolerance", "softness", "spill"] as const).map((k) => (
                  <SliderField
                    key={k}
                    label={
                      k === "spill"
                        ? "Spill suppression"
                        : k === "softness"
                          ? "Edge softness"
                          : "Color tolerance"
                    }
                    value={c.chroma[k]}
                    onChange={(v) =>
                      update({ chroma: { ...c.chroma, [k]: v } })
                    }
                  />
                ))}
                <p className="hint">
                  Put a background image, video, or shape on a track below this
                  clip.
                </p>
              </Section>
            )}
            {c.effects.length > 0 && (
              <Section title="Applied effects">
                {c.effects.map((e, i) => (
                  <div className="applied-effect" key={e.id}>
                    <header>
                      <Toggle
                        label={e.type}
                        value={e.enabled}
                        onChange={(v) =>
                          update({
                            effects: c.effects.map((x) =>
                              x.id === e.id ? { ...x, enabled: v } : x,
                            ),
                          })
                        }
                      />
                      <button
                        className="icon-button"
                        aria-label={`Remove ${e.type}`}
                        onClick={() =>
                          update({
                            effects: c.effects.filter((x) => x.id !== e.id),
                          })
                        }
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </header>
                    <SliderField
                      label={`${e.type} intensity`}
                      value={e.amount}
                      onChange={(v) =>
                        update({
                          effects: c.effects.map((x) =>
                            x.id === e.id ? { ...x, amount: v } : x,
                          ),
                        })
                      }
                      onKeyframe={() => key(`effects.${i}.amount`, e.amount)}
                    />
                  </div>
                ))}
              </Section>
            )}
            <Section
              title="Keyframes"
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => key("opacity", c.opacity)}
                >
                  <Icon name="plus" size={13} />
                </Button>
              }
            >
              <KeyframeList c={c} update={update} />
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
function KeyframeList({
  c,
  update,
}: {
  c: Clip;
  update: (changes: Partial<Clip>) => void;
}) {
  const [clipboard, setClipboard] = useState<Keyframe[]>([]);
  return (
    <>
      <div className="button-row">
        <Button
          size="sm"
          onClick={() => setClipboard(structuredClone(c.keyframes))}
          disabled={!c.keyframes.length}
        >
          Copy keys
        </Button>
        <Button
          size="sm"
          disabled={!clipboard.length}
          onClick={() =>
            update({
              keyframes: [
                ...c.keyframes,
                ...clipboard.map((k) => ({ ...k, id: id() })),
              ],
            })
          }
        >
          Paste
        </Button>
      </div>
      {!c.keyframes.length ? (
        <p className="hint">
          Move the playhead, then click a diamond next to a property. Add a
          second keyframe to animate.
        </p>
      ) : (
        c.keyframes.map((k) => (
          <div className="keyframe-row" key={k.id}>
            <button
              className="keyframe-path"
              title="Seek to keyframe"
              onClick={() => useEditor.getState().seek(c.start + k.time)}
            >
              <Icon name="diamond" size={12} />
              {k.path}
            </button>
            <div className="field-pair">
              <NumberField
                label="Time"
                value={k.time}
                min={0}
                max={c.duration}
                step={0.01}
                onChange={(v) =>
                  update({
                    keyframes: c.keyframes.map((x) =>
                      x.id === k.id ? { ...x, time: v } : x,
                    ),
                  })
                }
              />
              <NumberField
                label="Value"
                value={k.value}
                step={0.01}
                onChange={(v) =>
                  update({
                    keyframes: c.keyframes.map((x) =>
                      x.id === k.id ? { ...x, value: v } : x,
                    ),
                  })
                }
              />
            </div>
            <div className="keyframe-actions">
              <select
                aria-label="Keyframe interpolation"
                value={k.easing}
                onChange={(e) =>
                  update({
                    keyframes: c.keyframes.map((x) =>
                      x.id === k.id
                        ? {
                            ...x,
                            easing: e.target.value as Keyframe["easing"],
                            bezier: [0.42, 0, 0.58, 1],
                          }
                        : x,
                    ),
                  })
                }
              >
                {["linear", "ease-in", "ease-out", "ease-in-out", "bezier"].map(
                  (v) => (
                    <option key={v}>{v}</option>
                  ),
                )}
              </select>
              <button
                className="icon-button"
                aria-label="Duplicate keyframe"
                onClick={() =>
                  update({
                    keyframes: [
                      ...c.keyframes,
                      {
                        ...k,
                        id: id(),
                        time: Math.min(c.duration, k.time + 0.1),
                      },
                    ],
                  })
                }
              >
                <Icon name="copy" size={14} />
              </button>
              <button
                className="icon-button"
                aria-label="Delete keyframe"
                onClick={() =>
                  update({
                    keyframes: c.keyframes.filter((x) => x.id !== k.id),
                  })
                }
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
            {k.easing === "bezier" && (
              <div className="field-pair">
                {(k.bezier ?? [0.42, 0, 0.58, 1]).map((v, i) => (
                  <NumberField
                    key={i}
                    label={["x1", "y1", "x2", "y2"][i]}
                    value={v}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(n) => {
                      const curve = [...(k.bezier ?? [0.42, 0, 0.58, 1])] as [
                        number,
                        number,
                        number,
                        number,
                      ];
                      curve[i] = n;
                      update({
                        keyframes: c.keyframes.map((x) =>
                          x.id === k.id ? { ...x, bezier: curve } : x,
                        ),
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </>
  );
}
