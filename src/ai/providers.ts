import { api } from "../auth/client";
import { parseSubtitles, type Caption } from "../captions/subtitles";
export interface SpeechProvider {
  id: string;
  name: string;
  transcribe: (audio: Blob, signal?: AbortSignal) => Promise<Caption[]>;
}
export const serverWhisper: SpeechProvider = {
  id: "whisper-server",
  name: "Self-hosted Whisper",
  async transcribe(audio, signal) {
    const data = new FormData();
    data.append("file", audio, "audio.wav");
    const result = await api("/ai/transcribe", {
      method: "POST",
      body: data,
      signal,
    });
    return parseSubtitles(result.srt);
  },
};
export type ModelTask =
  | "background-removal"
  | "object-detection"
  | "motion-tracking"
  | "reframe"
  | "interpolate";
export interface ModelJob {
  id: string;
  task: ModelTask;
  mediaId: string;
  parameters: Record<string, unknown>;
  state: "queued" | "running" | "completed" | "failed";
  progress: number;
  result?: string;
}
export interface ModelProvider {
  capabilities: ModelTask[];
  submit: (
    task: ModelTask,
    mediaId: string,
    parameters: Record<string, unknown>,
  ) => Promise<ModelJob>;
  cancel: (jobId: string) => Promise<void>;
}
export const serverModels: ModelProvider = {
  capabilities: [
    "background-removal",
    "object-detection",
    "motion-tracking",
    "reframe",
    "interpolate",
  ],
  submit: (task, mediaId, parameters) =>
    api("/ai/jobs", {
      method: "POST",
      body: JSON.stringify({ task, mediaId, parameters }),
    }),
  cancel: async (id) => {
    await api("/ai/jobs/" + encodeURIComponent(id), { method: "DELETE" });
  },
};
