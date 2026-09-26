import { and, eq, isNull } from "drizzle-orm";
import { db, type Db } from "@/lib/db";
import { approvals, drafts, memberships, messages, outbox } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { requireMember } from "@/lib/authz";
import { audienceHash, contentHash, sha256 } from "@/lib/hash";
import { assertCanSendDirect } from "./direct";
import { getOwnedDraft } from "./drafts";

const APPROVAL_STALE = "The message or audience changed after you approved it. Please review and approve again.";

async function currentMemberIds(conn: Db, circleId: string): Promise<string[]> {
  const rows = await conn
    .select({ id: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.circleId, circleId), isNull(memberships.removedAt)));
  return rows.map((r) => r.id);
}

export interface ApprovalResult {
  approvalId: string;
  draftVersion: number;
  audience: number;
}

interface MeaningFlags {
  unsupported_additions?: string[];
  lost_meaning?: string[];
}

/**
 * The only place an approval is created. It binds user, draft, version, exact text and audience (FR21).
 * The caller must echo the exact text they previewed; model output never reaches here as a flag.
 */
export async function approveDraft(
  userId: string,
  draftId: string,
  expectedVersion: number,
  previewedText: string,
  acknowledgedFlags: boolean,
): Promise<ApprovalResult> {
  const draft = await getOwnedDraft(userId, draftId);
  if (draft.version !== expectedVersion) throw new AppError("stale_version", APPROVAL_STALE);
  if (draft.text !== previewedText) throw new AppError("stale_version", APPROVAL_STALE);
  if (!draft.text.trim()) throw new AppError("invalid_input", "Message cannot be empty.");
  const assist = draft.assist as MeaningFlags | null;
  const flags = [...(assist?.unsupported_additions ?? []), ...(assist?.lost_meaning ?? [])];
  if (draft.aiAssisted && flags.length > 0 && !acknowledgedFlags) {
    throw new AppError("conflict", "Please review the highlighted meaning changes before approving.");
  }
  await requireMember(userId, draft.circleId);
  const memberIds = await currentMemberIds(db(), draft.circleId);
  const [approval] = await db()
    .insert(approvals)
    .values({
      ownerId: userId,
      draftId,
      draftVersion: draft.version,
      contentHash: contentHash(draft.text),
      audienceHash: audienceHash(draft.circleId, draft.replyToId, memberIds),
    })
    .returning({ id: approvals.id });
  await db()
    .update(drafts)
    .set({ status: "APPROVED" })
    .where(and(eq(drafts.id, draftId), eq(drafts.version, draft.version)));
  return { approvalId: approval.id, draftVersion: draft.version, audience: memberIds.length };
}

export interface PublishInput {
  circleId: string;
  text: string;
  replyToId: string | null;
  idempotencyKey: string;
  draftId: string | null;
  approvalId: string | null;
}

export interface PublishResult {
  messageId: string;
  replayed: boolean;
}

function payloadHashOf(input: PublishInput): string {
  return sha256(
    JSON.stringify([input.circleId, input.replyToId, input.text.normalize("NFC"), input.draftId, input.approvalId]),
  );
}

/** Verifies the approval against the live draft and audience inside the send transaction. */
async function verifyApproval(tx: Db, userId: string, input: PublishInput): Promise<boolean> {
  if (!input.draftId) {
    if (input.approvalId) throw new AppError("invalid_input", "Approval requires its draft.");
    return false;
  }
  const draft = await getOwnedDraft(userId, input.draftId, tx, true);
  if (draft.status === "SENT" || draft.circleId !== input.circleId || draft.replyToId !== input.replyToId) {
    throw new AppError("stale_version", APPROVAL_STALE);
  }
  if (!input.approvalId) {
    if (draft.aiAssisted) throw new AppError("conflict", "AI-assisted messages need your approval before sending.");
    return false;
  }
  const [approval] = await tx
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, input.approvalId), eq(approvals.ownerId, userId), eq(approvals.draftId, draft.id)));
  const memberIds = await currentMemberIds(tx, input.circleId);
  const matches =
    approval !== undefined &&
    draft.status === "APPROVED" &&
    draft.version === approval.draftVersion &&
    draft.circleId === input.circleId &&
    draft.replyToId === input.replyToId &&
    draft.text === input.text &&
    contentHash(input.text) === approval.contentHash &&
    audienceHash(input.circleId, input.replyToId, memberIds) === approval.audienceHash;
  if (!matches) throw new AppError("stale_version", APPROVAL_STALE);
  return draft.aiAssisted;
}

/** A reply must point at a message in the same circle. */
async function verifyReplyTarget(tx: Db, input: PublishInput): Promise<void> {
  if (!input.replyToId) return;
  const [target] = await tx
    .select({ circleId: messages.circleId })
    .from(messages)
    .where(eq(messages.id, input.replyToId));
  if (!target || target.circleId !== input.circleId) throw new AppError("not_found", "The message you replied to is not available.");
}

async function findExisting(tx: Db, userId: string, key: string) {
  const [row] = await tx
    .select({ id: messages.id, payloadHash: messages.payloadHash })
    .from(messages)
    .where(and(eq(messages.senderId, userId), eq(messages.idempotencyKey, key)));
  return row;
}

function replay(existing: { id: string; payloadHash: string }, payloadHash: string): PublishResult {
  if (existing.payloadHash !== payloadHash) {
    throw new AppError("conflict", "This send key was already used for a different message.");
  }
  return { messageId: existing.id, replayed: true };
}

/**
 * Atomic publish (spec §9): recheck membership, approval hashes, draft version and idempotency key,
 * then insert message + outbox in one transaction. Same key + same payload returns the same message ID.
 */
export async function publishMessage(userId: string, input: PublishInput): Promise<PublishResult> {
  const payloadHash = payloadHashOf(input);
  return db().transaction(async (tx) => {
    await requireMember(userId, input.circleId, tx);
    await assertCanSendDirect(tx, userId, input.circleId);
    const existing = await findExisting(tx, userId, input.idempotencyKey);
    if (existing) return replay(existing, payloadHash);

    await verifyReplyTarget(tx, input);
    const aiAssisted = await verifyApproval(tx, userId, input);
    const [inserted] = await tx
      .insert(messages)
      .values({
        circleId: input.circleId,
        senderId: userId,
        replyToId: input.replyToId,
        text: input.text,
        aiAssisted,
        approvalId: input.approvalId,
        idempotencyKey: input.idempotencyKey,
        payloadHash,
      })
      .onConflictDoNothing({ target: [messages.senderId, messages.idempotencyKey] })
      .returning({ id: messages.id });

    if (!inserted) {
      const winner = await findExisting(tx, userId, input.idempotencyKey);
      if (!winner) throw new AppError("internal", "Send could not be confirmed. Retry safely.");
      return replay(winner, payloadHash);
    }
    await tx.insert(outbox).values({ messageId: inserted.id, circleId: input.circleId, kind: "message.created" });
    if (input.draftId) {
      await tx.update(drafts).set({ status: "SENT", updatedAt: new Date() }).where(eq(drafts.id, input.draftId));
    }
    return { messageId: inserted.id, replayed: false };
  });
}
