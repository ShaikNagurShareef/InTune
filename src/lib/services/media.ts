import { and, eq, isNull } from "drizzle-orm";
import { parseBuffer } from "music-metadata";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { canonicalMime, sniffContainer } from "@/lib/media/sniff";
import { deleteObject, readObject } from "@/lib/media/storage";

export type MediaKind = "audio" | "video";

const MB = 1024 * 1024;
export const MEDIA_LIMITS: Record<MediaKind, { maxBytes: number; maxSec: number; contentTypes: string[] }> = {
  audio: {
    maxBytes: 10 * MB,
    maxSec: 30,
    contentTypes: ["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/webm", "audio/ogg"],
  },
  video: { maxBytes: 20 * MB, maxSec: 15, contentTypes: ["video/mp4", "video/webm", "video/quicktime"] },
};

/** Bumped whenever the processing disclosure text changes (SEC04). */
export const CONSENT_VERSION = "gemini-processing-v1";
export const MEDIA_TTL_MS = 24 * 60 * 60 * 1000;
const DURATION_TOLERANCE_SEC = 1;

export const uploadPrefix = (userId: string): string => `media/${userId}/`;

export type MediaRow = typeof media.$inferSelect;

async function probeDuration(bytes: Buffer, mime: string): Promise<number | null> {
  try {
    const meta = await parseBuffer(bytes, { mimeType: mime }, { duration: true, skipCovers: true });
    return typeof meta.format.duration === "number" && Number.isFinite(meta.format.duration) ? meta.format.duration : null;
  } catch {
    return null;
  }
}

export interface RegisterInput {
  storageKey: string;
  kind: MediaKind;
  consentVersion: string;
  clientDurationSec: number;
}

/**
 * Verifies an uploaded object before it can be processed: owner prefix, size, file signature and duration.
 * Rejected files are deleted immediately with a specific error (FR13, FR14).
 */
export async function registerMedia(userId: string, input: RegisterInput): Promise<MediaRow> {
  if (!input.storageKey.startsWith(uploadPrefix(userId)) || input.storageKey.includes("..")) throw notFound();
  if (input.consentVersion !== CONSENT_VERSION) {
    throw new AppError("invalid_input", "Please confirm that this recording will be processed by Gemini.");
  }
  const limits = MEDIA_LIMITS[input.kind];
  const bytes = await readObject(input.storageKey);
  if (!bytes) throw new AppError("not_found", "The upload did not arrive. Please try again.");

  const reject = async (message: string, code: "invalid_input" | "too_large" = "invalid_input") => {
    await deleteObject(input.storageKey);
    return new AppError(code, message);
  };
  if (bytes.length > limits.maxBytes) throw await reject(`This file is larger than ${limits.maxBytes / MB} MB.`, "too_large");
  const container = sniffContainer(bytes);
  if (!container) throw await reject("This file type isn't supported. Use WAV, MP3, M4A, WebM or MP4.");
  const mime = canonicalMime(container, input.kind);
  const probed = await probeDuration(bytes, mime);
  const duration = probed ?? input.clientDurationSec;
  if (duration > limits.maxSec + DURATION_TOLERANCE_SEC) {
    throw await reject(`Recordings can be up to ${limits.maxSec} seconds.`);
  }
  const [row] = await db()
    .insert(media)
    .values({
      ownerId: userId,
      storageKey: input.storageKey,
      kind: input.kind,
      mime,
      sizeBytes: bytes.length,
      durationSec: duration,
      consentVersion: input.consentVersion,
      expiresAt: new Date(Date.now() + MEDIA_TTL_MS),
    })
    .returning();
  return row;
}

export async function getOwnedMedia(userId: string, mediaId: string): Promise<MediaRow> {
  const [row] = await db()
    .select()
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.ownerId, userId), isNull(media.deletedAt)));
  if (!row) throw notFound();
  return row;
}

/** Raw media is erased as soon as it has been processed (SEC05). */
export async function eraseMedia(mediaId: string): Promise<void> {
  const [row] = await db().select().from(media).where(eq(media.id, mediaId));
  if (!row || row.deletedAt) return;
  await deleteObject(row.storageKey);
  await db().update(media).set({ deletedAt: new Date(), processedAt: row.processedAt ?? new Date() }).where(eq(media.id, mediaId));
}

export async function deleteOwnedMedia(userId: string, mediaId: string): Promise<void> {
  await getOwnedMedia(userId, mediaId);
  await eraseMedia(mediaId);
}
