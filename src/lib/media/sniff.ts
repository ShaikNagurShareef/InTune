/** Container detection from file signatures; the declared MIME type is never trusted (spec §4 input validation). */
export type Container = "wav" | "mp3" | "mp4" | "webm" | "ogg";

export function sniffContainer(bytes: Uint8Array): Container | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length < 12) return null;
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "wav";
  if (ascii(4, 8) === "ftyp") return "mp4";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  if (ascii(0, 4) === "OggS") return "ogg";
  if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "mp3";
  return null;
}

export function canonicalMime(container: Container, kind: "audio" | "video"): string {
  switch (container) {
    case "wav":
      return "audio/wav";
    case "mp3":
      return "audio/mp3";
    case "ogg":
      return "audio/ogg";
    case "webm":
      return kind === "video" ? "video/webm" : "audio/webm";
    case "mp4":
      return kind === "video" ? "video/mp4" : "audio/mp4";
  }
}
