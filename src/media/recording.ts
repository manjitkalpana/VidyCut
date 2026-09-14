export type RecordingKind = "voice" | "screen" | "webcam";
export async function beginRecording(
  kind: RecordingKind,
  onStream: (s: MediaStream) => void,
  options: { microphone: boolean; systemAudio: boolean },
) {
  if (!navigator.mediaDevices)
    throw new Error(
      "Your browser does not support recording here. Use HTTPS in a desktop browser.",
    );
  let stream: MediaStream;
  const extra: MediaStream[] = [];
  if (kind === "screen") {
    if (!navigator.mediaDevices.getDisplayMedia)
      throw new Error("Your browser does not support screen recording.");
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: options.systemAudio,
    });
    if (options.microphone) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        extra.push(mic);
        const context = new AudioContext();
        const destination = context.createMediaStreamDestination();
        for (const input of [stream, mic])
          if (input.getAudioTracks().length)
            context.createMediaStreamSource(input).connect(destination);
        stream = new MediaStream([
          ...stream.getVideoTracks(),
          ...destination.stream.getAudioTracks(),
        ]);
        stream.getTracks().forEach((t) =>
          t.addEventListener("ended", () => {
            void context.close();
          }),
        );
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("Microphone access was not granted.");
      }
    }
  } else
    stream = await navigator.mediaDevices.getUserMedia({
      video: kind === "webcam" ? { width: 1280, height: 720 } : false,
      audio: kind === "voice" || options.microphone,
    });
  onStream(stream);
  const candidates =
    kind === "voice"
      ? ["audio/webm;codecs=opus", "audio/mp4"]
      : [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/mp4",
        ];
  const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("Your browser cannot record this format.");
  }
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  const result = new Promise<File>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error("Recording failed."));
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      extra.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
      resolve(
        new File(
          [blob],
          `${kind}-${new Date().toISOString().replace(/:/g, "-")}.${mimeType.includes("mp4") ? "mp4" : "webm"}`,
          { type: blob.type },
        ),
      );
    };
  });
  stream.getVideoTracks().forEach((t) =>
    t.addEventListener("ended", () => {
      if (recorder.state === "recording") recorder.stop();
    }),
  );
  recorder.start(500);
  return {
    stream,
    result,
    stop: () => {
      if (recorder.state === "recording") recorder.stop();
    },
  };
}
