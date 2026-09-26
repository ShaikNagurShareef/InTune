import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { blocks, circles, memberships, messages, reports, users } from "@/lib/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { requireOwner } from "@/lib/authz";
import { recordEvent } from "@/lib/metrics";
import { getMessageForMember, tombstone } from "./messages";

// Block and report never call Gemini, so they work during any AI outage (FR08, NFR08).

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  if (blockerId === blockedId) throw new AppError("invalid_input", "You can't block yourself.");
  const [target] = await db().select({ id: users.id }).from(users).where(eq(users.id, blockedId));
  if (!target) throw notFound();
  await db().insert(blocks).values({ blockerId, blockedId }).onConflictDoNothing();
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await db().delete(blocks).where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)));
}

export async function listBlocked(blockerId: string): Promise<{ id: string; displayName: string }[]> {
  return db()
    .select({ id: users.id, displayName: users.displayName })
    .from(blocks)
    .innerJoin(users, eq(users.id, blocks.blockedId))
    .where(eq(blocks.blockerId, blockerId));
}

/** The reporter chooses whether the message text is included (consent). */
export async function reportMessage(
  reporterId: string,
  messageId: string,
  reason: string,
  includeText: boolean,
): Promise<{ id: string }> {
  const message = await getMessageForMember(reporterId, messageId);
  const [row] = await db()
    .insert(reports)
    .values({
      reporterId,
      circleId: message.circleId,
      messageId,
      reason,
      includedText: includeText && !message.deletedAt ? message.text : null,
    })
    .returning({ id: reports.id });
  void recordEvent("report_created", { included_text: includeText });
  return row;
}

export interface QueueItem {
  id: string;
  circleName: string;
  reason: string;
  includedText: string | null;
  messageId: string;
  status: string;
  createdAt: Date;
}

/** Circle owners moderate their own circles in this build. */
export async function moderationQueue(userId: string): Promise<QueueItem[]> {
  const owned = await db()
    .select({ id: memberships.circleId })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.role, "owner")));
  if (!owned.length) return [];
  return db()
    .select({
      id: reports.id,
      circleName: circles.name,
      reason: reports.reason,
      includedText: reports.includedText,
      messageId: reports.messageId,
      status: reports.status,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .innerJoin(circles, eq(circles.id, reports.circleId))
    .where(and(inArray(reports.circleId, owned.map((o) => o.id)), eq(reports.status, "open")))
    .orderBy(desc(reports.createdAt));
}

export async function resolveReport(userId: string, reportId: string, action: "dismiss" | "remove"): Promise<void> {
  const [report] = await db().select().from(reports).where(eq(reports.id, reportId));
  if (!report) throw notFound();
  await requireOwner(userId, report.circleId);
  if (action === "remove") {
    const [m] = await db().select({ id: messages.id }).from(messages).where(eq(messages.id, report.messageId));
    if (m) await tombstone(m.id);
  }
  await db()
    .update(reports)
    .set({ status: action === "remove" ? "removed" : "dismissed", resolvedBy: userId, resolvedAt: new Date() })
    .where(eq(reports.id, reportId));
}
