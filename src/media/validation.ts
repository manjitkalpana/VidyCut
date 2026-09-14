const TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "audio/aac",
];
export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
export function validateMedia(file: {
  size: number;
  type: string;
  name: string;
}) {
  if (!file.size) throw new Error("This file is empty.");
  if (file.size > MAX_FILE_SIZE)
    throw new Error(
      "This file exceeds the 2 GB local processing safety limit. Use a smaller source or a proxy.",
    );
  if (!TYPES.includes(file.type.split(";")[0]))
    throw new Error(
      "Video format is not supported. Choose MP4, WebM, MOV, a supported image, or an audio file.",
    );
  if (file.name.length > 256) throw new Error("Please use a shorter filename.");
  return true;
}
export async function validateSignature(file: Blob) {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = String.fromCharCode(...bytes);
  const t = file.type.split(";")[0];
  const ok =
    t === "image/png"
      ? bytes[0] === 137 && ascii.slice(1, 4) === "PNG"
      : t === "image/jpeg"
        ? bytes[0] === 255 && bytes[1] === 216
        : t === "image/gif"
          ? ascii.startsWith("GIF8")
          : t === "image/webp"
            ? ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP"
            : t.includes("mp4") || t === "video/quicktime" || t === "image/avif"
              ? ascii.slice(4, 8) === "ftyp"
              : t.includes("webm")
                ? bytes[0] === 26 && bytes[1] === 69
                : t.includes("wav")
                  ? ascii.startsWith("RIFF")
                  : t.includes("ogg")
                    ? ascii.startsWith("OggS")
                    : t === "audio/flac"
                      ? ascii.startsWith("fLaC")
                      : t === "audio/mpeg"
                        ? ascii.startsWith("ID3") || bytes[0] === 255
                        : true;
  if (!ok) throw new Error("The file contents do not match its media type.");
}
