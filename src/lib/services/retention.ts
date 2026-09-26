import { and, asc, eq, isNull, lt, ne, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditEvents,
  circles,
  drafts,
  jobs,
  media,
  memberships,
  messages,
  phraseEntries,
  rateLimits,
  readingAids,
  users,
} from "@/lib/db/schema";
import { deleteCheckpoints } from "@/lib/graph/checkpointer";
import { randomToken } from "@/lib/hash";
import { eraseMedia } from "./media";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOG_RETENTION_MS = 7 * DAY_MS;

export interface PurgeReport {
  media: number;
  drafts: number;
  jobs: number;
  events: number;
}

/** Retention policy from SEC05: raw media, abandoned drafts and checkpoints after 24 h; logs after 7 days. */
export async function purgeExpired(now = new Date()): Promise<PurgeReport> {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const expiredMedia = await db()
    .select({ id: media.id })
    .from(media)
    .where(and(isNull(media.deletedAt), lt(media.expiresAt, now)));
  for (const m of expiredMedia) await eraseMedia(m.id);

  const oldJobs = await db().select({ id: jobs.id }).from(jobs).where(lt(jobs.updatedAt, dayAgo));
  for (const j of oldJobs) await deleteCheckpoints(j.id);
  if (oldJobs.length) await db().delete(jobs).where(inArray(jobs.id, oldJobs.map((j) => j.id)));

  const abandoned = await db()
    .delete(drafts)
    .where(lt(drafts.updatedAt, dayAgo))
    .returning({ id: drafts.id });

  const events = await db()
    .delete(auditEvents)
    .where(lt(auditEvents.createdAt, new Date(now.getTime() - LOG_RETENTION_MS)))
    .returning({ id: auditEvents.id });
  await db().delete(rateLimits).where(lt(rateLimits.windowStart, dayAgo));

  return { media: expiredMedia.length, drafts: abandoned.length, jobs: oldJobs.length, events: events.length };
}

/**
 * Account deletion (FR29, SEC06): access is revoked immediately, owned content is tombstoned and
 * derivatives (drafts, jobs, checkpoints, media, phrasebook, reading aids) are removed now.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const userJobs = await db().select({ id: jobs.id }).from(jobs).where(eq(jobs.ownerId, userId));
  const userMedia = await db().select({ id: media.id }).from(media).where(eq(media.ownerId, userId));
  for (const m of userMedia) await eraseMedia(m.id);
  for (const j of userJobs) await deleteCheckpoints(j.id);

  await db().transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(users)
      .set({ deletedAt: now, email: `deleted+${userId}@invalid`, displayName: "Former member", passwordHash: randomToken() })
      .where(eq(users.id, userId));
    await tx.update(messages).set({ deletedAt: now, text: "" }).where(eq(messages.senderId, userId));
    await tx.delete(drafts).where(eq(drafts.ownerId, userId));
    await tx.delete(phraseEntries).where(eq(phraseEntries.ownerId, userId));
    await tx.delete(readingAids).where(eq(readingAids.userId, userId));

    const owned = await tx
      .select({ circleId: memberships.circleId })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.role, "owner"), isNull(memberships.removedAt)));
    for (const { circleId } of owned) {
      const [heir] = await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.circleId, circleId), isNull(memberships.removedAt), ne(memberships.userId, userId)))
        .orderBy(asc(memberships.joinedAt))
        .limit(1);
      if (heir) {
        await tx
          .update(memberships)
          .set({ role: "owner" })
          .where(and(eq(memberships.circleId, circleId), eq(memberships.userId, heir.userId)));
        await tx.update(circles).set({ ownerId: heir.userId }).where(eq(circles.id, circleId));
      } else {
        await tx.update(circles).set({ deletedAt: now }).where(eq(circles.id, circleId));
      }
    }
    await tx.update(memberships).set({ removedAt: now }).where(eq(memberships.userId, userId));
  });
}

/** "Delete my drafts and recordings" without deleting the account. */
export async function deleteDraftsAndRecordings(userId: string): Promise<void> {
  const userMedia = await db().select({ id: media.id }).from(media).where(eq(media.ownerId, userId));
  for (const m of userMedia) await eraseMedia(m.id);
  const userJobs = await db().select({ id: jobs.id }).from(jobs).where(eq(jobs.ownerId, userId));
  for (const j of userJobs) await deleteCheckpoints(j.id);
  await db().delete(drafts).where(eq(drafts.ownerId, userId));
}
