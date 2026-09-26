import { GoogleGenAI, createPartFromUri, FileState, type Part } from "@google/genai";
import { AppError } from "@/lib/errors";
import type { GeminiCredentials } from "@/lib/gemini/client";
import { readObject } from "./storage";

const INLINE_LIMIT_BYTES = 8 * 1024 * 1024;
const FILE_POLL_MS = 1000;
const FILE_READY_TIMEOUT_MS = 20_000;

export interface MediaPart {
  part: Part;
  cleanup(): Promise<void>;
}

const noop = async () => undefined;

/** Small files go inline; larger video uses the Files API and is deleted from Gemini right after use. */
export async function geminiMediaPart(
  creds: GeminiCredentials,
  object: { storageKey: string; mime: string },
): Promise<MediaPart> {
  const bytes = await readObject(object.storageKey);
  if (!bytes) throw new AppError("not_found", "The recording is no longer available. Please record again.");
  if (bytes.length <= INLINE_LIMIT_BYTES) {
    return { part: { inlineData: { mimeType: object.mime, data: bytes.toString("base64") } }, cleanup: noop };
  }
  const ai = new GoogleGenAI({ apiKey: creds.apiKey });
  const file = await ai.files
    .upload({ file: new Blob([new Uint8Array(bytes)], { type: object.mime }), config: { mimeType: object.mime } })
    .catch(() => {
      throw new AppError("ai_unavailable", "Gemini could not receive this video. Try a shorter clip or type your message.");
    });
  const name = file.name;
  if (!name) throw new AppError("ai_unavailable", "Upload to Gemini failed. You can still type your message.");
  const cleanup = async () => {
    await ai.files.delete({ name }).catch(() => undefined);
  };
  const deadline = Date.now() + FILE_READY_TIMEOUT_MS;
  let current = file;
  while (current.state === FileState.PROCESSING && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, FILE_POLL_MS));
    current = await ai.files.get({ name }).catch(() => current);
  }
  if (current.state !== FileState.ACTIVE || !current.uri) {
    await cleanup();
    throw new AppError("ai_unavailable", "Gemini could not read this video. Try a shorter clip or type your message.");
  }
  return { part: createPartFromUri(current.uri, object.mime), cleanup };
}
