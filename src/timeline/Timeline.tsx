import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useEditor } from "../editor/store";
import { durationOf, id, type Clip } from "../projects/schema";
import { snapTime } from "./operations";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui/button";
import { addMediaToTimeline, importFiles } from "../media/registry";
import { clipAction } from "../editor/commands";
export function timecode(t: number, fps = 30) {
  const frames = Math.floor(Math.max(0, t) * fps + 0.001);
  return `${String(Math.floor(frames / fps / 3600)).padStart(2, "0")}:${String(Math.floor(frames / fps / 60) % 60).padStart(2, "0")}:${String(Math.floor(frames / fps) % 60).padStart(2, "0")}:${String(frames % fps).padStart(2, "0")}`;
}
type Gesture = {
  id: string;
  edge: "move" | "left" | "right";
  initialX: number;
  start: number;
  duration: number;
  inPoint: number;
  trackId: string;
  previewStart: number;
  previewDuration: number;
  previewTrack: string;
};
export function Timeline() {
  const s = useEditor();
  const scroller = useRef<HTMLDivElement>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const dragRef = useRef<Gesture | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [scroll, setScroll] = useState(0);
  const [viewport, setViewport] = useState(1200);
  const [height, setHeight] = useState(300);
  const [pinch, setPinch] = useState<{ distance: number; zoom: number } | null>(
    null,
  );
  const selected = s.project.clips.find((c) => c.id === s.selected);
  const total = Math.max(20, durationOf(s.project) + 5);
  const width = Math.max(viewport - 154, total * s.zoom);
  const interval = s.zoom > 100 ? 1 : s.zoom > 35 ? 5 : 10;
  const ticks = Array.from(
    { length: Math.ceil(width / s.zoom / interval) + 1 },
    (_, i) => i * interval,
  );
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const resize = new ResizeObserver(() => setViewport(node.clientWidth));
    resize.observe(node);
    return () => resize.disconnect();
  }, []);
  const startGesture = (
    e: ReactPointerEvent,
    c: Clip,
    edge: Gesture["edge"],
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (s.project.tracks.find((t) => t.id === c.trackId)?.locked) return;
    s.select(c.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const g = {
      id: c.id,
      edge,
      initialX: e.clientX,
      start: c.start,
      duration: c.duration,
      inPoint: c.inPoint,
      trackId: c.trackId,
      previewStart: c.start,
      previewDuration: c.duration,
      previewTrack: c.trackId,
    };
    dragRef.current = g;
    setGesture(g);
  };
  const moveGesture = (e: ReactPointerEvent) => {
    const g = dragRef.current;
    if (!g) return;
    const delta = (e.clientX - g.initialX) / s.zoom;
    let t = g.edge === "right" ? g.start + g.duration + delta : g.start + delta;
    if (s.snap) t = snapTime(t, s.project, g.id, 8 / s.zoom);
    let previewStart = g.start,
      previewDuration = g.duration,
      previewTrack = g.trackId;
    const c = s.project.clips.find((c) => c.id === g.id)!;
    if (g.edge === "move") {
      previewStart = Math.max(0, t);
      const row = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("[data-track-id]");
      if (row) previewTrack = row.getAttribute("data-track-id") ?? g.trackId;
    }
    if (g.edge === "left") {
      previewStart = Math.max(
        g.start - g.inPoint / c.speed,
        Math.min(g.start + g.duration - 1 / s.project.fps, t),
      );
      previewDuration = g.duration + g.start - previewStart;
    }
    if (g.edge === "right")
      previewDuration = Math.max(1 / s.project.fps, t - g.start);
    const next = { ...g, previewStart, previewDuration, previewTrack };
    dragRef.current = next;
    setGesture(next);
  };
  const endGesture = () => {
    const g = dragRef.current;
    if (!g) return;
    if (g.edge === "move")
      s.dispatch({
        type: "move",
        id: g.id,
        start: g.previewStart,
        trackId: g.previewTrack,
      });
    else
      s.dispatch({
        type: "trim",
        id: g.id,
        edge: g.edge,
        time: g.edge === "left" ? g.previewStart : g.start + g.previewDuration,
      });
    if (s.magnetic && g.edge === "move")
      s.mutate("Close track gaps", (p) => {
        let time = 0;
        p.clips
          .filter((c) => c.trackId === g.previewTrack)
          .sort((a, b) => a.start - b.start)
          .forEach((c) => {
            c.start = time;
            time += c.duration;
          });
      });
    dragRef.current = null;
    setGesture(null);
  };
  const seek = (e: ReactPointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    s.set({ playing: false });
    s.seek(Math.max(0, (e.clientX - rect.left) / s.zoom));
  };
  return (
    <section className="timeline" style={{ height }}>
      <div
        className="timeline-resizer"
        onPointerDown={(e) => {
          const y = e.clientY,
            h = height;
          const move = (ev: PointerEvent) =>
            setHeight(
              Math.max(
                190,
                Math.min(window.innerHeight * 0.62, h + y - ev.clientY),
              ),
            );
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      />
      <div className="timeline-toolbar">
        <div className="button-row">
          <Button
            variant="ghost"
            size="sm"
            title="Split (S)"
            disabled={!selected}
            onClick={() => void clipAction("split")}
          >
            <Icon name="split" size={16} />
            <span>Split</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="Delete"
            disabled={!selected}
            onClick={() => void clipAction("delete")}
          >
            <Icon name="trash" size={16} />
            <span>Delete</span>
          </Button>
          <i />
          <Button
            variant="ghost"
            size="sm"
            className={s.snap ? "selected-control" : ""}
            onClick={() => s.set({ snap: !s.snap })}
            title="Snap to clip edges"
          >
            <Icon name="magnet" size={17} />
            <span>Snapping</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={s.magnetic ? "selected-control" : ""}
            title="Magnetic timeline"
            onClick={() => s.set({ magnetic: !s.magnetic })}
          >
            <Icon name="animation" size={17} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Add marker at playhead"
            onClick={() =>
              s.mutate("Add marker", (p) => {
                p.markers.push({
                  id: id(),
                  time: s.playhead,
                  label: `Marker ${p.markers.length + 1}`,
                });
              })
            }
          >
            <Icon name="marker" size={17} />
          </Button>
        </div>
        <div className="button-row timeline-zoom">
          <Button
            variant="ghost"
            size="icon"
            title="Zoom out timeline"
            onClick={() => s.set({ zoom: Math.max(10, s.zoom / 1.25) })}
          >
            <Icon name="minus" size={16} />
          </Button>
          <input
            aria-label="Timeline zoom"
            type="range"
            min={10}
            max={220}
            value={s.zoom}
            onChange={(e) => s.set({ zoom: +e.target.value })}
          />
          <Button
            variant="ghost"
            size="icon"
            title="Zoom in timeline"
            onClick={() => s.set({ zoom: Math.min(220, s.zoom * 1.25) })}
          >
            <Icon name="plus" size={16} />
          </Button>
          <i />
          <Button
            variant="ghost"
            size="icon"
            title="Fit timeline"
            onClick={() =>
              s.set({
                zoom: Math.max(
                  10,
                  Math.min(
                    220,
                    (viewport - 200) / Math.max(10, durationOf(s.project)),
                  ),
                ),
              })
            }
          >
            <Icon name="fullscreen" size={17} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Audio mixer"
            onClick={() => s.set({ modal: "mixer" })}
          >
            <Icon name="audio" size={17} />
          </Button>
        </div>
      </div>
      <div
        className="timeline-scroll"
        ref={scroller}
        onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
        onWheel={(e) => {
          if (e.ctrlKey) {
            e.preventDefault();
            s.set({
              zoom: Math.max(
                10,
                Math.min(220, s.zoom * (e.deltaY < 0 ? 1.1 : 0.9)),
              ),
            });
          }
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 2)
            setPinch({
              distance: Math.abs(e.touches[0].clientX - e.touches[1].clientX),
              zoom: s.zoom,
            });
        }}
        onTouchMove={(e) => {
          if (pinch && e.touches.length === 2)
            s.set({
              zoom: Math.max(
                10,
                Math.min(
                  220,
                  (pinch.zoom *
                    Math.abs(e.touches[0].clientX - e.touches[1].clientX)) /
                    Math.max(1, pinch.distance),
                ),
              ),
            });
        }}
        onTouchEnd={() => setPinch(null)}
      >
        <div className="timeline-content" style={{ width: width + 154 }}>
          <div className="ruler-row">
            <div className="ruler-label">
              <button
                title="Add video track"
                onClick={() => s.addTrack("video")}
              >
                <Icon name="plus" size={14} />
                Track
              </button>
            </div>
            <div
              className="ruler"
              style={{ width }}
              onPointerDown={(e) => {
                seek(e);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) seek(e);
              }}
            >
              {ticks.map((t) => (
                <span key={t} style={{ left: t * s.zoom }}>
                  {timecode(t, s.project.fps).slice(0, -3)}
                </span>
              ))}
              {s.project.markers.map((m) => (
                <button
                  key={m.id}
                  className="timeline-marker"
                  style={{ left: m.time * s.zoom }}
                  title={`${m.label} · right click to remove`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    s.seek(m.time);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    s.mutate("Delete marker", (p) => {
                      p.markers = p.markers.filter((x) => x.id !== m.id);
                    });
                  }}
                >
                  <Icon name="marker" size={14} />
                </button>
              ))}
            </div>
          </div>
          {s.project.tracks.map((track) => (
            <div
              className={`track-row ${track.locked ? "locked" : ""}`}
              data-track-id={track.id}
              key={track.id}
              style={{ height: track.height }}
            >
              <div className="track-heading">
                <button
                  className={track.hidden || track.muted ? "muted" : ""}
                  title={
                    track.kind === "video"
                      ? "Hide / show track"
                      : "Mute / unmute track"
                  }
                  onClick={() =>
                    s.mutate("Toggle track", (p) => {
                      const t = p.tracks.find((t) => t.id === track.id)!;
                      if (t.kind === "video") t.hidden = !t.hidden;
                      else t.muted = !t.muted;
                    })
                  }
                >
                  <Icon
                    name={
                      track.kind === "video"
                        ? "eye"
                        : track.muted
                          ? "mute"
                          : "volume"
                    }
                    size={15}
                  />
                </button>
                <input
                  aria-label={`Track ${track.name} name`}
                  value={track.name}
                  onChange={(e) =>
                    s.mutate("Rename track", (p) => {
                      p.tracks.find((t) => t.id === track.id)!.name =
                        e.target.value;
                    })
                  }
                />
                <button
                  title={track.locked ? "Unlock track" : "Lock track"}
                  className={track.locked ? "selected-control" : ""}
                  onClick={() =>
                    s.mutate("Lock track", (p) => {
                      p.tracks.find((t) => t.id === track.id)!.locked =
                        !track.locked;
                    })
                  }
                >
                  <Icon name={track.locked ? "lock" : "unlock"} size={13} />
                </button>
                <div
                  className="track-height-handle"
                  title="Resize track"
                  onPointerDown={(e) => {
                    const y = e.clientY;
                    const move = (ev: PointerEvent) => {
                      const row = (e.target as HTMLElement).closest(
                        ".track-row",
                      ) as HTMLElement;
                      if (row)
                        row.style.height =
                          Math.max(
                            38,
                            Math.min(180, track.height + ev.clientY - y),
                          ) + "px";
                    };
                    const end = (ev: PointerEvent) => {
                      s.mutate("Resize track", (p) => {
                        p.tracks.find((t) => t.id === track.id)!.height =
                          Math.max(
                            38,
                            Math.min(180, track.height + ev.clientY - y),
                          );
                      });
                      window.removeEventListener("pointermove", move);
                      window.removeEventListener("pointerup", end);
                    };
                    window.addEventListener("pointermove", move);
                    window.addEventListener("pointerup", end);
                  }}
                />
              </div>
              <div
                className="track-lane"
                style={{ width }}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) {
                    seek(e);
                    s.select(null);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect(),
                    at = Math.max(0, (e.clientX - rect.left) / s.zoom);
                  const mediaId = e.dataTransfer.getData("vidycut/media");
                  if (mediaId) addMediaToTimeline(mediaId, at, track.id);
                  else if (e.dataTransfer.files.length) {
                    await importFiles(e.dataTransfer.files);
                    const media = useEditor.getState().project.media.at(-1);
                    if (media) addMediaToTimeline(media.id, at, track.id);
                  }
                }}
              >
                {s.project.clips
                  .filter(
                    (c) =>
                      c.trackId === track.id &&
                      (((c.start + c.duration) * s.zoom > scroll - 300 &&
                        c.start * s.zoom < scroll + viewport + 300) ||
                        c.id === gesture?.id),
                  )
                  .map((c) => {
                    const g = gesture?.id === c.id ? gesture : null;
                    const m = s.project.media.find((m) => m.id === c.mediaId);
                    return (
                      <div
                        key={c.id}
                        tabIndex={0}
                        role="button"
                        aria-label={`${c.name} timeline clip`}
                        title={`${c.name} · ${c.duration.toFixed(2)}s`}
                        className={`timeline-clip clip-${c.kind} ${c.id === s.selected ? "is-selected" : ""} ${track.locked ? "is-locked" : ""}`}
                        style={{
                          left: (g?.previewStart ?? c.start) * s.zoom,
                          width: Math.max(
                            3,
                            (g?.previewDuration ?? c.duration) * s.zoom,
                          ),
                          height: track.height - 14,
                          top: 7,
                        }}
                        onPointerDown={(e) => startGesture(e, c, "move")}
                        onPointerMove={moveGesture}
                        onPointerUp={endGesture}
                        onPointerCancel={endGesture}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          s.select(c.id);
                          setMenu({
                            x: Math.min(window.innerWidth - 220, e.clientX),
                            y: Math.max(
                              70,
                              Math.min(window.innerHeight - 440, e.clientY),
                            ),
                          });
                        }}
                      >
                        <div
                          className="clip-fill"
                          style={
                            m?.thumbnail
                              ? { backgroundImage: `url(${m.thumbnail})` }
                              : undefined
                          }
                        />
                        {m?.waveform && (
                          <Waveform
                            data={m.waveform}
                            clip={c}
                            mediaDuration={m.duration}
                          />
                        )}
                        <span className="clip-name">
                          <Icon
                            name={
                              c.kind === "text"
                                ? "text"
                                : c.kind === "audio"
                                  ? "audio"
                                  : c.kind === "shape"
                                    ? "elements"
                                    : "film"
                            }
                            size={12}
                          />
                          {c.name}
                        </span>
                        {c.speed !== 1 && (
                          <small className="clip-speed">{c.speed}×</small>
                        )}
                        {c.transition.type !== "none" && (
                          <span className="clip-transition">
                            <Icon name="transitions" size={12} />
                          </span>
                        )}
                        <div
                          className="trim-handle left"
                          title="Trim left edge"
                          onPointerDown={(e) => startGesture(e, c, "left")}
                        />
                        <div
                          className="trim-handle right"
                          title="Trim right edge"
                          onPointerDown={(e) => startGesture(e, c, "right")}
                        />
                        {c.keyframes.slice(0, 50).map((k) => (
                          <span
                            key={k.id}
                            className="clip-key"
                            style={{ left: k.time * s.zoom }}
                          />
                        ))}
                      </div>
                    );
                  })}
                {!s.project.clips.length && track.kind === "video" && (
                  <div className="timeline-empty">
                    <Icon name="film" size={24} />
                    <span>Drag media here to start editing</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="add-track-row">
            <button onClick={() => s.addTrack("video")}>
              <Icon name="plus" size={13} />
              Video track
            </button>
            <button onClick={() => s.addTrack("audio")}>
              <Icon name="plus" size={13} />
              Audio track
            </button>
          </div>
          <div className="playhead" style={{ left: 154 + s.playhead * s.zoom }}>
            <div
              className="playhead-cap"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) {
                  const rect = scroller.current!.getBoundingClientRect();
                  s.seek(
                    Math.max(
                      0,
                      (e.clientX - rect.left + scroll - 154) / s.zoom,
                    ),
                  );
                  s.set({ playing: false });
                }
              }}
            />
          </div>
          {s.project.inPoint !== undefined && (
            <div
              className="range-marker in"
              style={{ left: 154 + s.project.inPoint * s.zoom }}
              title="In point"
            />
          )}
          {s.project.outPoint !== undefined && (
            <div
              className="range-marker out"
              style={{ left: 154 + s.project.outPoint * s.zoom }}
              title="Out point"
            />
          )}
        </div>
      </div>
      <footer className="timeline-status">
        <span>
          {s.project.clips.length} clips · {s.project.tracks.length} tracks
        </span>
        <span>
          {s.project.width} × {s.project.height} · {s.project.fps} fps
        </span>
        <span>Local workspace</span>
      </footer>
      {menu && (
        <>
          <div
            className="context-backdrop"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            role="menu"
            className="context-menu"
            style={{ left: menu.x, top: menu.y }}
          >
            {[
              ["cut", "Cut"],
              ["copy", "Copy"],
              ["paste", "Paste"],
              ["split", "Split at playhead"],
              ["duplicate", "Duplicate"],
              ["delete", "Delete"],
              ["ripple", "Ripple delete"],
              ["speed", "Speed"],
              ["reverse", "Reverse"],
              ["freeze", "Freeze frame"],
              ["detach", "Detach audio"],
              ["extract", "Extract audio (WAV)"],
            ].map(([action, label]) => (
              <button
                role="menuitem"
                key={action}
                onClick={() => {
                  setMenu(null);
                  void clipAction(action).catch((e) => s.notify(e.message));
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
function Waveform({
  data,
  clip,
  mediaDuration,
}: {
  data: number[];
  clip: Clip;
  mediaDuration: number;
}) {
  const bins = 100;
  const path = Array.from({ length: bins }, (_, i) => {
    const t = clip.inPoint + (i / (bins - 1)) * clip.duration * clip.speed;
    const value =
      data[
        Math.min(data.length - 1, Math.floor((t / mediaDuration) * data.length))
      ] ?? 0;
    const a = Math.max(1, Math.min(20, value * 70));
    return `M${i} ${22 - a}V${22 + a}`;
  }).join(" ");
  return (
    <svg
      className="clip-wave"
      viewBox="0 0 100 44"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={path} stroke="currentColor" strokeWidth=".55" />
    </svg>
  );
}
