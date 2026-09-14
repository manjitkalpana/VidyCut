import { useState, useRef } from "react";
import { useEditor } from "../editor/store";
import { Button } from "../components/ui/button";
import { Icon } from "../components/Icon";
import {
  importFiles,
  addMediaToTimeline,
  mediaURL,
  relinkMedia,
} from "./registry";
import { loadSample } from "../projects/sample";
import { id, type Media } from "../projects/schema";
export function MediaPanel({ audioOnly = false }: { audioOnly?: boolean }) {
  const s = useEditor();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState(audioOnly ? "audio" : "all"),
    [sort, setSort] = useState("recent"),
    [busy, setBusy] = useState(false),
    [info, setInfo] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement>(null),
    replace = useRef<HTMLInputElement>(null);
  const [destination, setDestination] = useState("");
  const target = useRef<string | null>(null);
  const files = s.project.media
    .filter(
      (m) =>
        (!query || m.name.toLowerCase().includes(query.toLowerCase())) &&
        (filter === "all" || filter === "favorites"
          ? filter !== "favorites" || m.favorite
          : m.kind === filter),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "duration"
          ? b.duration - a.duration
          : b.added - a.added,
    );
  const upload = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    await importFiles(files);
    setBusy(false);
  };
  const preview = async (m: Media) => {
    const url = await mediaURL(m);
    const w = window.open("", "_blank");
    if (!w) return;
    w.opener = null;
    w.document.title = m.name;
    w.document.body.style.cssText =
      "margin:0;background:#121619;display:grid;place-items:center;min-height:100vh;";
    const el = w.document.createElement(
      m.kind === "image" ? "img" : m.kind === "audio" ? "audio" : "video",
    );
    el.src = url;
    if (m.kind !== "image") {
      (el as HTMLMediaElement).controls = true;
    }
    el.style.cssText = "max-width:100%;max-height:100vh";
    w.document.body.append(el);
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="video/*,audio/*,image/png,image/jpeg,image/webp,image/gif,image/avif"
        multiple
        hidden
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={folder}
        type="file"
        {...{ webkitdirectory: "", directory: "" }}
        multiple
        hidden
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={replace}
        type="file"
        accept="video/*,audio/*,image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && target.current)
            void relinkMedia(target.current, f).catch((e) =>
              s.notify(e.message),
            );
          e.target.value = "";
        }}
      />
      <div className="tabs">
        <button className="active">Local</button>
        <button onClick={() => s.set({ modal: "projects" })}>Projects</button>
      </div>
      <div className="search-row">
        <div className="search-input">
          <Icon name="search" size={15} />
          <input
            placeholder="Search media…"
            aria-label="Search media"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Media filter"
          className="compact-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["all", "video", "image", "audio", "favorites"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      {!s.project.media.length ? (
        <div
          className="import-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void upload(e.dataTransfer.files);
          }}
        >
          <Icon name="folder" size={44} />
          <h3>{busy ? "Importing media…" : "Import media"}</h3>
          <p>
            Drag files here or{" "}
            <button onClick={() => input.current?.click()}>browse</button>
          </p>
          <Button
            onClick={() => {
              setBusy(true);
              void loadSample()
                .catch((e) => s.notify(e.message))
                .finally(() => setBusy(false));
            }}
            disabled={busy}
          >
            <Icon name="film" size={16} />
            Try sample project
          </Button>
        </div>
      ) : (
        <>
          <div className="media-actions">
            <Button
              size="sm"
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              <Icon name="plus" size={14} />
              {busy ? "Importing…" : "Import"}
            </Button>
            <button
              className="icon-button"
              title="Import folder"
              onClick={() => folder.current?.click()}
            >
              <Icon name="folder" size={16} />
            </button>
            <select
              aria-label="Sort media"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">Recent</option>
              <option value="name">Name</option>
              <option value="duration">Duration</option>
            </select>
          </div>
          <div
            className="media-grid"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              if (e.dataTransfer.files.length) {
                e.preventDefault();
                void upload(e.dataTransfer.files);
              }
            }}
          >
            {files.map((m) => (
              <div
                className="media-card"
                key={m.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("vidycut/media", m.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <button
                  className="media-thumb"
                  title="Add to timeline"
                  onDoubleClick={() => addMediaToTimeline(m.id)}
                  onClick={() => setInfo(info === m.id ? null : m.id)}
                >
                  {m.thumbnail ? (
                    <img src={m.thumbnail} alt={m.name} />
                  ) : (
                    <div className="audio-art">
                      <Icon name="audio" size={34} />
                    </div>
                  )}
                  <span className="media-duration">
                    {Math.floor(m.duration / 60)}:
                    {String(Math.floor(m.duration % 60)).padStart(2, "0")}
                  </span>
                </button>
                <button
                  className={`media-favorite ${m.favorite ? "active" : ""}`}
                  title="Favorite"
                  onClick={() =>
                    s.mutate("Favorite media", (p) => {
                      const e = p.media.find((x) => x.id === m.id)!;
                      e.favorite = !e.favorite;
                    })
                  }
                >
                  <Icon name="star" size={13} />
                </button>
                <div className="media-card-title">
                  <span title={m.name}>{m.name}</span>
                  <button
                    title="Add to timeline"
                    onClick={() => addMediaToTimeline(m.id)}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                </div>
                {info === m.id && (
                  <div className="media-info">
                    <input
                      aria-label="Rename media"
                      value={m.name}
                      onChange={(e) =>
                        s.mutate("Rename media", (p) => {
                          p.media.find((x) => x.id === m.id)!.name =
                            e.target.value;
                        })
                      }
                    />
                    <p>
                      {m.width ? `${m.width} × ${m.height} · ` : ""}
                      {m.fps ? `${m.fps.toFixed(2)} fps · ` : ""}
                      {(m.size / 1048576).toFixed(1)} MB
                    </p>
                    {m.folder && <p>{m.folder}</p>}
                    <label>
                      Destination track
                      <select
                        aria-label="Destination track"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                      >
                        <option value="">First compatible track</option>
                        {s.project.tracks
                          .filter(
                            (t) =>
                              !t.locked &&
                              (t.kind === "audio") === (m.kind === "audio"),
                          )
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="button-row">
                      <button
                        onClick={() =>
                          addMediaToTimeline(
                            m.id,
                            s.playhead,
                            destination || undefined,
                            "insert",
                          )
                        }
                      >
                        Insert at playhead
                      </button>
                      <button
                        onClick={() =>
                          addMediaToTimeline(
                            m.id,
                            s.playhead,
                            destination || undefined,
                            "overwrite",
                          )
                        }
                      >
                        Overwrite at playhead
                      </button>
                    </div>
                    <p>Changes only the destination track.</p>
                    <div className="button-row">
                      <button
                        onClick={() =>
                          void preview(m).catch((e) => s.notify(e.message))
                        }
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => {
                          target.current = m.id;
                          replace.current?.click();
                        }}
                      >
                        Relink
                      </button>
                      {m.kind === "video" && (
                        <button
                          onClick={() => {
                            setBusy(true);
                            void import("./proxy")
                              .then(({ createProxy }) =>
                                createProxy(
                                  m,
                                  () => {},
                                  new AbortController().signal,
                                ),
                              )
                              .then(() =>
                                s.notify(
                                  "Preview proxy created. Export uses the original.",
                                ),
                              )
                              .catch((e) => s.notify(e.message))
                              .finally(() => setBusy(false));
                          }}
                        >
                          {m.proxyId ? "Rebuild proxy" : "Create proxy"}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const copy = {
                            ...m,
                            id: id(),
                            name: m.name + " copy",
                          };
                          void import("../storage/local").then(
                            async ({ getBlob, putBlob }) => {
                              const blob = await getBlob(m.id);
                              if (blob) await putBlob(copy.id, blob);
                              s.mutate("Duplicate media", (p) => {
                                p.media.push(copy);
                              });
                            },
                          );
                        }}
                      >
                        Duplicate
                      </button>
                      <button
                        onClick={() => {
                          if (s.project.clips.some((c) => c.mediaId === m.id)) {
                            s.notify(
                              "Remove this media from the timeline before deleting it.",
                            );
                            return;
                          }
                          s.mutate("Delete media", (p) => {
                            p.media = p.media.filter((x) => x.id !== m.id);
                          });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!files.length && <p className="empty-message">No matching media.</p>}
          <p className="hint">
            Drag to a track, or use + to add. Double-click a thumbnail to
            append.
          </p>
        </>
      )}
      {audioOnly && (
        <div className="audio-panel-actions">
          <Button className="full" onClick={() => s.set({ modal: "record" })}>
            <Icon name="mic" />
            Record voiceover
          </Button>
          <Button className="full" onClick={() => s.set({ modal: "mixer" })}>
            <Icon name="audio" />
            Audio mixer
          </Button>
        </div>
      )}
    </>
  );
}
