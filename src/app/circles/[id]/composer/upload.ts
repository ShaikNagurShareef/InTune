"use client";

import { upload } from "@vercel/blob/client";
import { api, ApiError } from "@/lib/client/api";
import type { Capture } from "./recorder";

export type UploadMode = "blob" | "local";

export const CONSENT_VERSION = "gemini-processing-v1";

function extensionFor(type: string): string {
  if (type.includes("mp4") || type.includes("quicktime")) return "mp4";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  return "webm";
}

/** Uploads straight to private storage, then asks the server to verify the file before it can be used. */
export async function uploadCapture(capture: Capture, userId: string, mode: UploadMode): Promise<string> {
  const type = capture.blob.type || `${capture.kind}/webm`;
  let storageKey: string;
  if (mode === "blob") {
    const res = await upload(`media/${userId}/${capture.kind}.${extensionFor(type)}`, capture.blob, {
      access: "private",
      handleUploadUrl: "/api/v1/media",
      clientPayload: JSON.stringify({ kind: capture.kind }),
      contentType: type.split(";")[0],
    });
    storageKey = res.pathname;
  } else {
    const res = await fetch(`/api/v1/media/local?kind=${capture.kind}`, { method: "POST", body: capture.blob });
    if (!res.ok) throw new ApiError(res.status, "upload_failed", "Upload failed. Please try again.", true);
    storageKey = ((await res.json()) as { pathname: string }).pathname;
  }
  const registered = await api<{ id: string }>("/api/v1/media/register", {
    body: {
      storage_key: storageKey,
      kind: capture.kind,
      consent_version: CONSENT_VERSION,
      client_duration_sec: Math.round(capture.durationSec * 10) / 10,
    },
  });
  return registered.id;
}
