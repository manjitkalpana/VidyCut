import { useEditor } from "../editor/store";
import { Modal } from "../components/ui/dialog";
import { SliderField, Toggle } from "../editor/controls";
import { Button } from "../components/ui/button";
export function MixerModal() {
  const s = useEditor();
  return (
    <Modal
      open={s.modal === "mixer"}
      onClose={() => s.set({ modal: null })}
      title="Audio mixer"
      description="Balance tracks and shape the final mix."
      wide
    >
      <div className="mixer-channels">
        {s.project.tracks.map((t) => (
          <div className="mixer-channel" key={t.id}>
            <h3>{t.name}</h3>
            <span className="hint">{t.kind} track</span>
            <SliderField
              label={`${t.name} gain`}
              value={t.volume}
              max={2}
              format={(v) =>
                v === 0 ? "−∞ dB" : (20 * Math.log10(v)).toFixed(1) + " dB"
              }
              onChange={(v) =>
                s.mutate("Track volume", (p) => {
                  p.tracks.find((x) => x.id === t.id)!.volume = v;
                })
              }
            />
            <SliderField
              label={`${t.name} pan`}
              value={t.pan}
              min={-1}
              max={1}
              onChange={(v) =>
                s.mutate("Track pan", (p) => {
                  p.tracks.find((x) => x.id === t.id)!.pan = v;
                })
              }
            />
            <div className="button-row">
              <Button
                size="sm"
                className={t.muted ? "selected-control" : ""}
                onClick={() =>
                  s.mutate("Mute track", (p) => {
                    p.tracks.find((x) => x.id === t.id)!.muted = !t.muted;
                  })
                }
              >
                Mute
              </Button>
              <Button
                size="sm"
                className={t.solo ? "selected-control" : ""}
                onClick={() =>
                  s.mutate("Solo track", (p) => {
                    p.tracks.find((x) => x.id === t.id)!.solo = !t.solo;
                  })
                }
              >
                Solo
              </Button>
            </div>
          </div>
        ))}
        <div className="mixer-channel master">
          <h3>Master</h3>
          <span className="hint">Output bus</span>
          <SliderField
            label="Master volume"
            value={s.project.masterVolume}
            max={2}
            onChange={(v) =>
              s.mutate("Master volume", (p) => {
                p.masterVolume = v;
              })
            }
          />
          <Toggle
            label="Export limiter"
            value={s.project.limiter}
            onChange={(v) =>
              s.mutate("Master limiter", (p) => {
                p.limiter = v;
              })
            }
          />
          <p className="hint">
            Clip volume keyframes and fades are included in the mix.
          </p>
        </div>
      </div>
    </Modal>
  );
}
