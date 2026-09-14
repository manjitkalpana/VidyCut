import { useRef, useState } from "react";
import { useEditor } from "../editor/store";
import { Button } from "../components/ui/button";
import { Icon } from "../components/Icon";
import { captionClips, parseSubtitles, serializeSubtitles } from "./subtitles";
import { downloadBlob } from "../storage/local";
import { apiConfigured } from "../auth/client";
import { serverWhisper } from "../ai/providers";
import { mixAudio, wavBlob } from "../audio-engine/engine";
import { durationOf } from "../projects/schema";
import { addText } from "../editor/commands";
export function CaptionsPanel() {
  const s = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const clips = s.project.clips
    .filter((c) => c.kind === "text" && c.name.startsWith("Caption:"))
    .sort((a, b) => a.start - b.start);
  const importText = async (file: File) => {
    const captions = parseSubtitles(await file.text());
    if (!captions.length) {
      s.notify("No valid captions found. Choose SRT or VTT.");
      return;
    }
    const track = s.addTrack("video");
    s.mutate("Import captions", (p) => {
      p.clips.push(...captionClips(captions, p, track));
    });
    s.notify(`${captions.length} captions imported`);
  };
  return (
    <div className="panel-content">
      <p className="panel-intro">Make every word count.</p>
      <input
        ref={input}
        type="file"
        accept=".srt,.vtt"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importText(file);
          e.target.value = "";
        }}
      />
      <Button className="full" onClick={() => input.current?.click()}>
        <Icon name="import" />
        Import SRT / VTT
      </Button>
      <Button
        className="full"
        onClick={() => {
          addText("Your caption");
          const st = useEditor.getState(),
            c = st.project.clips.find((x) => x.id === st.selected);
          if (c)
            st.dispatch({
              type: "update",
              id: c.id,
              changes: {
                name: "Caption: Your caption",
                transform: { ...c.transform, y: st.project.height * 0.33 },
                text: {
                  ...c.text!,
                  size: 62,
                  stroke: 2,
                  background: "#00000099",
                },
              },
            });
          st.set({ tool: "Captions" });
        }}
      >
        <Icon name="plus" />
        Add caption
      </Button>
      <Button
        className="full"
        disabled={!apiConfigured || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const buffer = await mixAudio(s.project, 0, durationOf(s.project));
            if (!buffer) throw new Error("Add audio to the timeline first.");
            const captions = await serverWhisper.transcribe(wavBlob(buffer));
            const track = s.addTrack("video");
            s.mutate("Generate captions", (p) => {
              p.clips.push(...captionClips(captions, p, track));
            });
          } catch (e) {
            s.notify(
              e instanceof Error ? e.message : "Caption generation failed.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="ai" />
        {busy ? "Transcribing…" : "Generate with Whisper"}
      </Button>
      {!apiConfigured && (
        <p className="dependency-note">
          Automatic transcription needs a connected Whisper server. Importing
          and editing subtitles works offline.
        </p>
      )}
      <div className="button-row">
        {["SRT", "VTT"].map((format) => (
          <Button
            size="sm"
            key={format}
            disabled={!clips.length}
            onClick={() =>
              downloadBlob(
                new Blob(
                  [
                    serializeSubtitles(
                      clips.map((c) => ({
                        id: c.id,
                        start: c.start,
                        end: c.start + c.duration,
                        text: c.text?.content ?? "",
                      })),
                      format === "VTT",
                    ),
                  ],
                  { type: "text/plain" },
                ),
                s.project.name + "." + format.toLowerCase(),
              )
            }
          >
            Export {format}
          </Button>
        ))}
      </div>
      <div className="caption-list">
        {clips.map((c, i) => (
          <div
            className={`caption-item ${s.selected === c.id ? "active" : ""}`}
            key={c.id}
          >
            <button
              className="caption-time"
              onClick={() => {
                s.seek(c.start);
                s.select(c.id);
              }}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {c.start.toFixed(2)} — {(c.start + c.duration).toFixed(2)}
            </button>
            <textarea
              aria-label={`Caption ${i + 1}`}
              value={c.text?.content}
              onFocus={() => s.select(c.id)}
              onChange={(e) =>
                s.dispatch({
                  type: "update",
                  id: c.id,
                  changes: { text: { ...c.text!, content: e.target.value } },
                })
              }
            />
            <div className="button-row">
              <button
                onClick={() => {
                  s.select(c.id);
                  s.set({ tool: "Text" });
                }}
              >
                Style
              </button>
              <button
                onClick={() =>
                  s.dispatch({ type: "split", id: c.id, time: s.playhead })
                }
              >
                Split here
              </button>
              <button
                disabled={!clips[i + 1]}
                onClick={() => {
                  const next = clips[i + 1];
                  if (!next) return;
                  s.mutate("Merge captions", (p) => {
                    const first = p.clips.find((x) => x.id === c.id)!;
                    first.duration = next.start + next.duration - first.start;
                    first.text!.content += " " + next.text!.content;
                    p.clips = p.clips.filter((x) => x.id !== next.id);
                  });
                }}
              >
                Merge next
              </button>
              <button onClick={() => s.dispatch({ type: "delete", id: c.id })}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
