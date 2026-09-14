import { useEffect, useRef, useState } from "react";
import { Renderer } from "../video-engine/renderer";
import { PreviewAudio } from "../audio-engine/engine";
import { durationOf } from "../projects/schema";
import { useEditor } from "./store";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui/button";
import { timecode } from "../timeline/Timeline";
export function Preview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [quality, setQuality] = useState(720),
    [zoom, setZoom] = useState(1),
    [guides, setGuides] = useState(false),
    [error, setError] = useState("");
  const [moving, setMoving] = useState<{
    id: string;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    nextX: number;
    nextY: number;
  } | null>(null);
  const drag = useRef<typeof moving>(null);
  const [available, setAvailable] = useState({ width: 640, height: 400 });
  useEffect(() => {
    if (!host.current) return;
    const resize = new ResizeObserver(([entry]) =>
      setAvailable({
        width: Math.max(60, entry.contentRect.width - 28),
        height: Math.max(60, entry.contentRect.height - 24),
      }),
    );
    resize.observe(host.current);
    return () => resize.disconnect();
  }, []);
  const s = useEditor();
  const previewWidth = Math.min(
    available.width,
    (available.height * s.project.width) / s.project.height,
  );
  const duration = durationOf(s.project);
  const selected = s.project.clips.find(
    (c) =>
      c.id === s.selected &&
      c.kind !== "audio" &&
      s.playhead >= c.start &&
      s.playhead < c.start + c.duration,
  );
  const scale = Math.min(
    1,
    quality / Math.min(s.project.width, s.project.height),
  );
  useEffect(() => {
    const renderer = new Renderer(),
      audio = new PreviewAudio();
    let alive = true,
      raf = 0,
      last = performance.now(),
      busy = false,
      lastError = "",
      lastAudio = 0,
      lastStamp = "";
    const loop = async (now: number) => {
      if (!alive) return;
      const dt = Math.min(1, (now - last) / 1000);
      last = now;
      const state = useEditor.getState();
      let time = state.playhead;
      if (state.playing && state.modal !== "export") {
        time += dt * state.rate;
        const end = durationOf(state.project);
        if (time >= end || time < 0) {
          time = Math.max(0, Math.min(end - 0.001, time));
          state.set({ playing: false });
        }
        state.seek(time);
      }
      const stamp = [
        state.project.id,
        state.revision,
        time,
        canvas.current?.width,
        canvas.current?.height,
        drag.current?.nextX,
        drag.current?.nextY,
        state.playing,
      ].join(":");
      if (state.modal === "export") {
        audio.pause();
        lastStamp = "";
      } else if (
        !busy &&
        canvas.current &&
        (state.playing || stamp !== lastStamp)
      ) {
        busy = true;
        try {
          let p = state.project;
          if (drag.current) {
            const d = drag.current;
            p = {
              ...p,
              clips: p.clips.map((c) =>
                c.id === d.id
                  ? {
                      ...c,
                      transform: { ...c.transform, x: d.nextX, y: d.nextY },
                    }
                  : c,
              ),
            };
          }
          await renderer.render(canvas.current, p, time, {
            playing: state.playing && state.rate > 0,
            guides,
          });
          lastStamp = stamp;
          if (!state.playing || now - lastAudio > 70) {
            lastAudio = now;
            await audio.sync(p, time, state.playing, state.rate);
          }
          if (lastError) {
            setError("");
            lastError = "";
          }
        } catch (e) {
          const message =
            e instanceof Error
              ? e.message
              : "The preview could not be displayed.";
          if (message !== lastError) {
            lastError = message;
            setError(message);
          }
          audio.pause();
        } finally {
          busy = false;
        }
      }
      if (alive) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      renderer.dispose();
      audio.dispose();
    };
  }, [guides]);
  const play = () => {
    if (!s.project.clips.length) {
      s.notify("Import media or try the sample project to start editing.");
      return;
    }
    if (s.playhead >= duration - 0.05) s.seek(0);
    s.set({ playing: !s.playing, rate: 1 });
  };
  return (
    <main className="preview-pane">
      <header className="preview-header">
        <span>Preview</span>
        <div>
          <button
            className={guides ? "active" : ""}
            onClick={() => setGuides(!guides)}
            title="Safe margins and composition grid"
          >
            <Icon name="grid" size={15} />
          </button>
          <select
            aria-label="Preview quality"
            value={quality}
            onChange={(e) => setQuality(+e.target.value)}
          >
            {[360, 480, 720, 1080].map((n) => (
              <option value={n} key={n}>
                {n}p
              </option>
            ))}
          </select>
        </div>
      </header>
      <div ref={host} className="preview-stage">
        <div
          className="preview-canvas-wrap"
          style={{
            width: previewWidth,
            height: (previewWidth * s.project.height) / s.project.width,
            aspectRatio: s.project.width / s.project.height,
            transform: `scale(${zoom})`,
          }}
        >
          <canvas
            ref={canvas}
            aria-label="Video preview"
            width={Math.round(s.project.width * scale)}
            height={Math.round(s.project.height * scale)}
            onDoubleClick={play}
            onPointerDown={(e) => {
              if (!selected) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const next = {
                id: selected.id,
                x: selected.transform.x,
                y: selected.transform.y,
                clientX: e.clientX,
                clientY: e.clientY,
                nextX: selected.transform.x,
                nextY: selected.transform.y,
              };
              setMoving(next);
              drag.current = next;
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const factor =
                s.project.width / e.currentTarget.getBoundingClientRect().width;
              const next = {
                ...d,
                nextX: d.x + (e.clientX - d.clientX) * factor,
                nextY: d.y + (e.clientY - d.clientY) * factor,
              };
              drag.current = next;
              setMoving(next);
            }}
            onPointerUp={() => {
              const d = drag.current;
              if (!d) return;
              const c = useEditor
                .getState()
                .project.clips.find((c) => c.id === d.id);
              if (c)
                s.dispatch({
                  type: "update",
                  id: c.id,
                  changes: {
                    transform: { ...c.transform, x: d.nextX, y: d.nextY },
                  },
                });
              drag.current = null;
              setMoving(null);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setMoving(null);
            }}
          />
          {selected && (
            <div
              className="selection-outline"
              style={{
                left: `${50 + ((moving?.nextX ?? selected.transform.x) / s.project.width) * 100}%`,
                top: `${50 + ((moving?.nextY ?? selected.transform.y) / s.project.height) * 100}%`,
                width: `${((selected.transform.width * selected.transform.scale) / s.project.width) * 100}%`,
                height: `${((selected.transform.height * selected.transform.scale) / s.project.height) * 100}%`,
                transform: `translate(-50%,-50%) rotate(${selected.transform.rotation}deg)`,
              }}
            >
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        {error && (
          <div className="preview-error">
            <Icon name="warning" size={20} />
            <p>{error}</p>
          </div>
        )}
      </div>
      <div className="playback-controls">
        <div className="time-display">
          <strong>{timecode(s.playhead, s.project.fps)}</strong>
          <span>/</span>
          <span>
            {s.project.clips.length
              ? timecode(duration, s.project.fps)
              : "00:00:00:00"}
          </span>
        </div>
        <div className="playback-buttons">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous frame"
            onClick={() =>
              s.set({
                playing: false,
                playhead: Math.max(0, s.playhead - 1 / s.project.fps),
              })
            }
          >
            <Icon name="prev" size={18} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={s.playing ? "Pause" : "Play"}
            onClick={play}
          >
            <Icon name={s.playing ? "pause" : "play"} size={22} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next frame"
            onClick={() =>
              s.set({
                playing: false,
                playhead: Math.min(duration, s.playhead + 1 / s.project.fps),
              })
            }
          >
            <Icon name="next" size={18} />
          </Button>
        </div>
        <div className="preview-options">
          <select
            aria-label="Aspect ratio"
            value={`${s.project.width}:${s.project.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split(":").map(Number);
              s.mutate("Change aspect ratio", (p) => {
                p.width = w;
                p.height = h;
              });
            }}
          >
            {[
              ["1920:1080", "16:9"],
              ["1080:1920", "9:16"],
              ["1080:1080", "1:1"],
              ["1080:1350", "4:5"],
              ["1440:1080", "4:3"],
              ["1080:1440", "3:4"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            aria-label="Preview zoom"
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
          >
            {[
              [1, "Fit"],
              [0.5, "50%"],
              [1.5, "150%"],
              [2, "200%"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label="Fullscreen preview"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void host.current
                  ?.requestFullscreen()
                  .catch(() =>
                    s.notify("Fullscreen is unavailable in this browser."),
                  );
            }}
          >
            <Icon name="fullscreen" size={18} />
          </button>
        </div>
      </div>
    </main>
  );
}
