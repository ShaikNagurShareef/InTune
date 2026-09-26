import { and, eq, isNull } from "drizzle-orm";
import { db, type Db } from "@/lib/db";
import { drafts, jobs, messages } from "@/lib/db/schema";
import { deleteCheckpoints } from "@/lib/graph/checkpointer";
import { AppError, notFound } from "@/lib/errors";
import { requireMember } from "@/lib/authz";
import type { SourceMode } from "@/lib/validation";

export type Draft = typeof drafts.$inferSelect;

export const isMediaMode = (mode: string): boolean => mode === "speak" || mode === "video";

export interface NewDraft {
  circleId: string;
  replyToId: string | null;
  sourceMode: SourceMode;
  sourceText: string;
  toneTags?: string[];
  /** Wording written by AI (e.g. a group plan) in place of the source text; it can only be sent after exact approval. */
  aiText?: string;
}

export async function createDraft(userId: string, input: NewDraft): Promise<Draft> {
  await requireMember(userId, input.circleId);
  if (input.replyToId) {
    const [target] = await db()
      .select({ circleId: messages.circleId })
      .from(messages)
      .where(eq(messages.id, input.replyToId));
    if (!target || target.circleId !== input.circleId) throw notFound();
  }
  const [row] = await db()
    .insert(drafts)
    .values({
      ownerId: userId,
      circleId: input.circleId,
      replyToId: input.replyToId,
      sourceMode: input.sourceMode,
      sourceText: input.sourceText,
      text: input.aiText ?? input.sourceText,
      toneTags: input.toneTags ?? [],
      aiAssisted: input.aiText !== undefined,
    })
    .returning();
  return row;
}

/** Drafts are strictly owner-scoped; anyone else gets a 404 (SEC02). */
export async function getOwnedDraft(userId: string, draftId: string, conn: Db = db(), lock = false): Promise<Draft> {
  const query = conn
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.ownerId, userId), isNull(drafts.deletedAt)));
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw notFound();
  return row;
}

export interface DraftPatch {
  expectedVersion: number;
  text?: string;
  sourceText?: string;
  sourceMode?: SourceMode;
  mediaId?: string | null;
  transcript?: string | null;
  toneTags?: string[];
  /** "Send original": replace assisted wording with the person's own words. */
  useOriginal?: boolean;
}

/**
 * Every edit bumps the version, which invalidates approvals and makes in-flight AI jobs obsolete (FR11, FR21, FR27).
 */
export async function updateDraft(userId: string, draftId: string, patch: DraftPatch): Promise<Draft> {
  const current = await getOwnedDraft(userId, draftId);
  if (current.status === "SENT") throw new AppError("conflict", "This draft was already sent.");
  const originalText = patch.sourceText ?? current.sourceText;
  const values = {
    version: patch.expectedVersion + 1,
    status: "DRAFT",
    updatedAt: new Date(),
    ...(patch.text !== undefined && { text: patch.text }),
    ...(patch.sourceText !== undefined && { sourceText: patch.sourceText }),
    ...(patch.sourceMode !== undefined && { sourceMode: patch.sourceMode }),
    ...(patch.mediaId !== undefined && { mediaId: patch.mediaId }),
    ...(patch.transcript !== undefined && { transcript: patch.transcript }),
    ...(patch.toneTags !== undefined && { toneTags: patch.toneTags }),
    // A transcript is itself Gemini output, so media-sourced words always go through approval.
    ...(patch.useOriginal && {
      text: current.transcript ?? originalText,
      aiAssisted: isMediaMode(current.sourceMode),
      assist: null,
    }),
  };
  const [row] = await db()
    .update(drafts)
    .set(values)
    .where(and(eq(drafts.id, draftId), eq(drafts.ownerId, userId), eq(drafts.version, patch.expectedVersion)))
    .returning();
  if (!row) throw new AppError("stale_version", "This draft changed. Showing the latest version.");
  return row;
}

export async function deleteDraft(userId: string, draftId: string): Promise<void> {
  await getOwnedDraft(userId, draftId);
  const draftJobs = await db().select({ id: jobs.id }).from(jobs).where(eq(jobs.draftId, draftId));
  for (const j of draftJobs) await deleteCheckpoints(j.id);
  await db().update(drafts).set({ deletedAt: new Date(), text: "", sourceText: "", transcript: null, assist: null }).where(eq(drafts.id, draftId));
}
