import { useEffect, useRef, useState } from "react";
import { useEditor } from "../editor/store";
import { Modal } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Icon } from "../components/Icon";
import { Select, NumberField } from "../editor/controls";
import {
  durationOf,
  dimensions,
  type ExportSettings,
} from "../projects/schema";
import { exportProject, type RenderProgress } from "./engine";
import { downloadBlob } from "../storage/local";
export function ExportModal() {
  const s = useEditor();
  const [config, setConfig] = useState<ExportSettings>(s.project.export);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [error, setError] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [running, setRunning] = useState(false);
  const [previewURL, setPreviewURL] = useState("");
  const abort = useRef<AbortController | null>(null);
  const duration = Math.max(
    0,
    Math.min(
      s.project.outPoint ?? durationOf(s.project),
      durationOf(s.project),
    ) - (s.project.inPoint ?? 0),
  );
  const dim = dimensions(s.project, config.resolution);
  useEffect(() => {
    if (!blob) {
      setPreviewURL("");
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreviewURL(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  useEffect(() => () => abort.current?.abort(), []);
  const start = async () => {
    setError("");
    setBlob(null);
    setProgress(null);
    setRunning(true);
    s.set({ playing: false });
    s.mutate("Export settings", (p) => {
      p.export = config;
    });
    abort.current = new AbortController();
    try {
      const result = await exportProject(
        structuredClone(s.project),
        config,
        setProgress,
        abort.current.signal,
      );
      setBlob(result);
    } catch (e) {
      if (import.meta.env.DEV) console.debug("[VidyCut export failure]", e);
      setError(
        abort.current.signal.aborted
          ? "Export canceled. You can start again."
          : e instanceof Error
            ? e.message
            : "Export failed. Try again.",
      );
    } finally {
      setRunning(false);
      abort.current = null;
    }
  };
  return (
    <Modal
      open={s.modal === "export"}
      onClose={() => {
        if (running) {
          abort.current?.abort();
        }
        s.set({ modal: null });
      }}
      title="Export your story"
      description="Everything you made. No watermark, always free."
      wide
    >
      <div className="export-layout">
        <div className="export-summary">
          <div className="export-preview">
            {previewURL ? (
              <video
                src={previewURL}
                controls
                aria-label="Exported video preview"
              />
            ) : (
              <div>
                <Icon name="export" size={40} />
                <strong>{s.project.name}</strong>
                <span>
                  {dim.width} × {dim.height}
                </span>
              </div>
            )}
          </div>
          <div className="export-specs">
            <span>{duration.toFixed(2)} seconds</span>
            <span>{config.fps} fps</span>
            <span>{config.format.toUpperCase()}</span>
          </div>
          <p className="hint">
            Estimated size:{" "}
            {(
              ((config.bitrate + config.audioBitrate) * duration) /
              8 /
              1048576
            ).toFixed(1)}{" "}
            MB
          </p>
          <div className="privacy-note">
            <Icon name="lock" size={16} />
            <p>Your video is rendered on this device.</p>
          </div>
        </div>
        <div className="export-settings">
          <fieldset disabled={running}>
            <Select
              label="Format"
              value={config.format}
              options={[
                { value: "mp4", label: "MP4 · H.264" },
                { value: "webm", label: "WebM · VP9 / VP8" },
                { value: "mov", label: "MOV · local FFmpeg conversion" },
              ]}
              onChange={(v) =>
                setConfig({ ...config, format: v as ExportSettings["format"] })
              }
            />
            <div className="field-pair">
              <Select
                label="Resolution"
                value={config.resolution}
                options={["480", "720", "1080", "1440", "2160"].map((v) => ({
                  value: v,
                  label: v === "2160" ? "4K" : v + "p",
                }))}
                onChange={(v) =>
                  setConfig({
                    ...config,
                    resolution: v as ExportSettings["resolution"],
                  })
                }
              />
              <Select
                label="Frames per second"
                value={config.fps}
                options={[24, 25, 30, 50, 60]}
                onChange={(v) =>
                  setConfig({ ...config, fps: +v as ExportSettings["fps"] })
                }
              />
            </div>
            <Select
              label="Quality"
              value={config.bitrate}
              options={[
                { value: "2000000", label: "Low · 2 Mbps" },
                { value: "5000000", label: "Medium · 5 Mbps" },
                { value: "8000000", label: "High · 8 Mbps" },
                { value: "16000000", label: "Very high · 16 Mbps" },
                { value: "45000000", label: "4K · 45 Mbps" },
                ...([2000000, 5000000, 8000000, 16000000, 45000000].includes(
                  config.bitrate,
                )
                  ? []
                  : [{ value: String(config.bitrate), label: "Custom" }]),
              ]}
              onChange={(v) => setConfig({ ...config, bitrate: +v })}
            />
            <NumberField
              label="Custom bitrate (Mbps)"
              value={config.bitrate / 1000000}
              min={0.1}
              max={150}
              step={0.1}
              onChange={(v) =>
                setConfig({ ...config, bitrate: Math.round(v * 1000000) })
              }
            />
            <Select
              label="Audio bitrate"
              value={config.audioBitrate}
              options={[128000, 192000, 256000, 320000].map((v) => ({
                value: String(v),
                label: v / 1000 + " kbps",
              }))}
              onChange={(v) =>
                setConfig({
                  ...config,
                  audioBitrate: +v as ExportSettings["audioBitrate"],
                })
              }
            />
            <div className="field-pair">
              <NumberField
                label="Export in"
                value={s.project.inPoint ?? 0}
                min={0}
                max={durationOf(s.project)}
                step={0.1}
                onChange={(v) =>
                  s.mutate("Export in point", (p) => {
                    p.inPoint = v;
                  })
                }
              />
              <NumberField
                label="Export out"
                value={s.project.outPoint ?? durationOf(s.project)}
                min={0}
                max={durationOf(s.project)}
                step={0.1}
                onChange={(v) =>
                  s.mutate("Export out point", (p) => {
                    p.outPoint = v;
                  })
                }
              />
            </div>
          </fieldset>
          {progress && (
            <div className="render-progress">
              <div>
                <strong>{progress.stage}</strong>
                <span>{Math.round(progress.progress * 100)}%</span>
              </div>
              <progress max={1} value={progress.progress} />
              <p>
                {progress.frames} / {progress.total} frames
                {progress.speed ? ` · ${progress.speed.toFixed(1)} fps` : ""}
                {running && progress.remaining
                  ? ` · about ${Math.ceil(progress.remaining)}s left`
                  : ""}
              </p>
            </div>
          )}
          {running && !progress && (
            <p className="hint">Preparing media and encoders…</p>
          )}
          {error && <p className="error-message">{error}</p>}
          <div className="button-row export-actions">
            {running ? (
              <Button
                className="full"
                variant="danger"
                onClick={() => abort.current?.abort()}
              >
                Cancel export
              </Button>
            ) : blob ? (
              <>
                <Button
                  variant="default"
                  onClick={() =>
                    downloadBlob(blob, s.project.name + "." + config.format)
                  }
                >
                  <Icon name="import" />
                  Download video
                </Button>
                <Button
                  onClick={() => {
                    setBlob(null);
                    setProgress(null);
                  }}
                >
                  Edit settings
                </Button>
              </>
            ) : (
              <Button
                variant="default"
                className="full"
                onClick={() => void start()}
              >
                <Icon name="export" />
                {error ? "Retry export" : "Export video"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
