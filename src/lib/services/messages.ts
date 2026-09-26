import { and, desc, eq, gte, lt, notInArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { blocks, messages, readingAids, users } from "@/lib/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { requireMember } from "@/lib/authz";

export const PAGE_SIZE = 30;

export interface FeedMessage {
  id: string;
  senderId: string;
  senderName: string;
  replyToId: string | null;
  text: string | null;
  version: number;
  aiAssisted: boolean;
  approvedBySender: boolean;
  createdAt: string;
  edited: boolean;
  deleted: boolean;
  mine: boolean;
}

export interface FeedPage {
  messages: FeedMessage[];
  nextCursor: string | null;
}

interface Cursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.createdAt.toISOString()}|${c.id}`).toString("base64url");
}

export function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  const [iso, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso);
  if (!id || Number.isNaN(createdAt.getTime())) throw new AppError("invalid_input", "Invalid cursor.");
  return { createdAt, id };
}

/**
 * Newest-first page of 30, ordered by server time then ID so pagination and polling never duplicate (FR06).
 * New members only see posts created after they joined; blocked authors are hidden for the blocker (FR08).
 */
export async function listMessages(userId: string, circleId: string, before: string | null): Promise<FeedPage> {
  const membership = await requireMember(userId, circleId);
  const cursor = decodeCursor(before);
  const hidden = (
    await db().select({ id: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, userId))
  ).map((r) => r.id);

  const rows = await db()
    .select({ m: messages, senderName: users.displayName })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(
      and(
        eq(messages.circleId, circleId),
        gte(messages.createdAt, membership.joinedAt),
        hidden.length ? notInArray(messages.senderId, hidden) : undefined,
        cursor
          ? or(
              lt(messages.createdAt, cursor.createdAt),
              and(eq(messages.createdAt, cursor.createdAt), lt(messages.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(PAGE_SIZE + 1);

  const page = rows.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    messages: page.map(({ m, senderName }) => toFeedMessage(m, senderName, userId)),
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last.m) : null,
  };
}

function toFeedMessage(m: typeof messages.$inferSelect, senderName: string, viewerId: string): FeedMessage {
  const deleted = m.deletedAt !== null;
  return {
    id: m.id,
    senderId: m.senderId,
    senderName,
    replyToId: m.replyToId,
    text: deleted ? null : m.text,
    version: m.version,
    aiAssisted: m.aiAssisted,
    approvedBySender: m.approvalId !== null,
    createdAt: m.createdAt.toISOString(),
    edited: m.editedAt !== null,
    deleted,
    mine: m.senderId === viewerId,
  };
}

/** Loads a message only if the viewer is a current member of its circle; otherwise a non-disclosing 404. */
export async function getMessageForMember(userId: string, messageId: string): Promise<typeof messages.$inferSelect> {
  const [m] = await db().select().from(messages).where(eq(messages.id, messageId));
  if (!m) throw notFound();
  await requireMember(userId, m.circleId);
  return m;
}

/** Corrected version by the sender. Hand edits are the sender's own words, so the AI label is cleared (FR07). */
export async function editMessage(
  userId: string,
  messageId: string,
  text: string,
  expectedVersion: number,
): Promise<void> {
  const m = await getMessageForMember(userId, messageId);
  if (m.senderId !== userId || m.deletedAt) throw notFound();
  const updated = await db()
    .update(messages)
    .set({ text, version: expectedVersion + 1, editedAt: new Date(), aiAssisted: false, approvalId: null })
    .where(and(eq(messages.id, messageId), eq(messages.version, expectedVersion)))
    .returning({ id: messages.id });
  if (!updated.length) throw new AppError("stale_version", "This message changed. Reload and try again.");
  await db().delete(readingAids).where(eq(readingAids.messageId, messageId));
}

/** Tombstone: text is erased and reading aids disappear (FR07, FR29). */
export async function deleteMessage(userId: string, messageId: string): Promise<void> {
  const m = await getMessageForMember(userId, messageId);
  if (m.senderId !== userId) throw notFound();
  await tombstone(messageId);
}

export async function tombstone(messageId: string): Promise<void> {
  await db().update(messages).set({ deletedAt: new Date(), text: "" }).where(eq(messages.id, messageId));
  await db().delete(readingAids).where(eq(readingAids.messageId, messageId));
}
