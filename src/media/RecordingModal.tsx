import { useState, useRef, useEffect } from "react";
import { Modal } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Toggle, Select } from "../editor/controls";
import { beginRecording, type RecordingKind } from "./recording";
import { importFiles, addMediaToTimeline } from "./registry";
import { useEditor } from "../editor/store";
export function RecordingModal() {
  const s = useEditor();
  const [kind, setKind] = useState<RecordingKind>("voice");
  const [microphone, setMicrophone] = useState(true);
  const [systemAudio, setSystemAudio] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<Awaited<ReturnType<typeof beginRecording>> | null>(
    null,
  );
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => session.current?.stop(), []);
  const start = async () => {
    setError("");
    try {
      session.current = await beginRecording(
        kind,
        (stream) => {
          if (video.current) {
            video.current.srcObject = stream;
            void video.current.play();
          }
        },
        { microphone, systemAudio },
      );
      setSeconds(0);
      setRecording(true);
      const file = await session.current.result;
      setRecording(false);
      session.current = null;
      await importFiles([file]);
      const media = useEditor.getState().project.media.at(-1);
      if (media) addMediaToTimeline(media.id, useEditor.getState().playhead);
      s.notify("Recording added to your timeline");
    } catch (e) {
      setRecording(false);
      setError(e instanceof Error ? e.message : "Recording failed.");
    }
  };
  return (
    <Modal
      open={s.modal === "record"}
      onClose={() => {
        session.current?.stop();
        s.set({ modal: null });
      }}
      title="Record into your timeline"
      description="Choose your source. Your browser will ask for permission."
    >
      <div className="modal-body">
        <Select
          label="Record"
          value={kind}
          options={[
            { value: "voice", label: "Voiceover / microphone" },
            { value: "screen", label: "Screen or window" },
            { value: "webcam", label: "Webcam" },
          ]}
          onChange={(v) => {
            if (!recording) setKind(v as RecordingKind);
          }}
        />
        {kind !== "voice" && (
          <Toggle
            label="Include microphone"
            value={microphone}
            onChange={setMicrophone}
          />
        )}{" "}
        {kind === "screen" && (
          <>
            <Toggle
              label="Request system audio"
              value={systemAudio}
              onChange={setSystemAudio}
            />
            <p className="hint">
              System audio and window sharing depend on your browser and the
              source you select.
            </p>
          </>
        )}
        {kind !== "voice" && (
          <video ref={video} muted playsInline className="recording-preview" />
        )}
        <div className={`recording-time ${recording ? "recording" : ""}`}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </div>
        {error && <p className="error-message">{error}</p>}
        <Button
          className="full"
          variant={recording ? "danger" : "default"}
          onClick={() => (recording ? session.current?.stop() : void start())}
        >
          {recording ? "Stop & add to timeline" : "Start recording"}
        </Button>
      </div>
    </Modal>
  );
}
