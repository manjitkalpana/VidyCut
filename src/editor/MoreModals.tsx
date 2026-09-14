import { useEffect, useRef, useState } from "react";
import { Modal } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Icon } from "../components/Icon";
import { useEditor } from "./store";
import { effects } from "../effects/catalog";
import { filters } from "../filters/catalog";
import { addMediaToTimeline } from "../media/registry";
import { listProjects } from "../storage/local";
import { id, newClip, type Project, type Clip } from "../projects/schema";
import { Field, NumberField } from "./controls";
export function SearchModal() {
  const s = useEditor();
  const [query, setQuery] = useState(""),
    [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    void listProjects().then(setProjects);
  }, []);
  const q = query.toLowerCase();
  const entries = [
    ...s.project.media.map((m) => ({
      key: m.id,
      label: m.name,
      type: m.kind,
      action: () => addMediaToTimeline(m.id),
    })),
    ...effects.map((e) => ({
      key: e.id,
      label: e.name,
      type: "Effect",
      action: () => {
        const c = s.project.clips.find((c) => c.id === s.selected);
        if (c)
          s.dispatch({
            type: "update",
            id: c.id,
            changes: {
              effects: [
                ...c.effects,
                { id: id(), type: e.id, amount: 0.4, enabled: true },
              ],
            },
          });
        else s.notify("Select a clip before applying an effect.");
      },
    })),
    ...filters.map((f) => ({
      key: f.id,
      label: f.name,
      type: "Filter",
      action: () => {
        if (s.selected)
          s.dispatch({
            type: "update",
            id: s.selected,
            changes: { filter: f.id },
          });
        else s.notify("Select a clip before applying a filter.");
      },
    })),
    ...projects.map((p) => ({
      key: p.id,
      label: p.name,
      type: "Project",
      action: () => s.load(p),
    })),
  ].filter((e) => e.label.toLowerCase().includes(q));
  return (
    <Modal
      open={s.modal === "search"}
      onClose={() => s.set({ modal: null })}
      title="Search your workspace"
      description="Find media, projects, effects, and filters."
    >
      <div className="modal-body">
        <div className="search-input">
          <Icon name="search" />
          <input
            autoFocus
            placeholder="Search anything…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="search-results">
          {entries.slice(0, 40).map((e) => (
            <button
              key={e.type + e.key}
              onClick={() => {
                e.action();
                s.set({ modal: null });
              }}
            >
              <span>{e.label}</span>
              <small>{e.type}</small>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
export function DrawingModal() {
  const s = useEditor();
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<NonNullable<Clip["drawing"]>>([]);
  const current = useRef<NonNullable<Clip["drawing"]>[number] | null>(null);
  const [color, setColor] = useState("#79e6bd"),
    [width, setWidth] = useState(12),
    [mode, setMode] = useState("pen");
  const redraw = () => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 960, 540);
    for (const stroke of strokes.current) {
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width / 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      stroke.points.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x * 960, y * 540);
        else ctx.lineTo(x * 960, y * 540);
      });
      ctx.stroke();
    }
  };
  return (
    <Modal
      open={s.modal === "drawing"}
      onClose={() => s.set({ modal: null })}
      title="Draw a layer"
      description="Add original marks and annotations to your video."
      wide
    >
      <div className="modal-body">
        <div className="drawing-tools">
          <Button
            className={mode === "pen" ? "selected-control" : ""}
            onClick={() => setMode("pen")}
          >
            <Icon name="pen" />
            Pen
          </Button>
          <Button
            className={mode === "eraser" ? "selected-control" : ""}
            onClick={() => setMode("eraser")}
          >
            Erase stroke
          </Button>
          <Field label="Color">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </Field>
          <NumberField
            label="Stroke width"
            value={width}
            min={1}
            max={100}
            onChange={setWidth}
          />
          <Button
            onClick={() => {
              strokes.current.pop();
              redraw();
            }}
          >
            Undo stroke
          </Button>
          <Button
            onClick={() => {
              strokes.current = [];
              redraw();
            }}
          >
            Clear
          </Button>
        </div>
        <canvas
          className="drawing-canvas"
          width={960}
          height={540}
          ref={canvas}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const rect = e.currentTarget.getBoundingClientRect();
            const point: [number, number] = [
              (e.clientX - rect.left) / rect.width,
              (e.clientY - rect.top) / rect.height,
            ];
            if (mode === "eraser") {
              strokes.current = strokes.current.filter(
                (s) =>
                  !s.points.some(
                    ([x, y]) => Math.hypot(x - point[0], y - point[1]) < 0.04,
                  ),
              );
              redraw();
              return;
            }
            current.current = { points: [point], color, width };
            strokes.current.push(current.current);
          }}
          onPointerMove={(e) => {
            if (!current.current) return;
            const rect = e.currentTarget.getBoundingClientRect();
            current.current.points.push([
              (e.clientX - rect.left) / rect.width,
              (e.clientY - rect.top) / rect.height,
            ]);
            redraw();
          }}
          onPointerUp={() => {
            current.current = null;
          }}
          onPointerCancel={() => {
            current.current = null;
          }}
        />
        <Button
          className="full"
          variant="default"
          onClick={() => {
            if (!strokes.current.length) {
              s.notify("Draw a stroke first.");
              return;
            }
            const trackId = s.addTrack("video");
            const c = newClip("drawing", trackId, s.playhead, {
              name: "Drawing",
              drawing: structuredClone(strokes.current),
              transform: {
                x: 0,
                y: 0,
                scale: 1,
                rotation: 0,
                width: s.project.width,
                height: s.project.height,
                anchorX: 0.5,
                anchorY: 0.5,
                flipX: false,
                flipY: false,
              },
            });
            s.dispatch({ type: "add", clip: c });
            s.select(c.id);
            s.set({ modal: null });
          }}
        >
          Add drawing to timeline
        </Button>
      </div>
    </Modal>
  );
}
