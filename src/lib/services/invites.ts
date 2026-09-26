import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { blocks, circles, invitations, memberships, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { requireOwner } from "@/lib/authz";
import { randomToken, sha256 } from "@/lib/hash";
import { activeMemberCount, activeMembers, MEMBER_CAP } from "./circles";

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const INVALID_INVITE = "This invitation is no longer valid. You can ask the person who invited you for a new one.";

export async function createInvite(
  ownerId: string,
  circleId: string,
  targetEmail: string | null,
): Promise<{ id: string; token: string; expiresAt: Date }> {
  await requireOwner(ownerId, circleId);
  if ((await activeMemberCount(circleId)) >= MEMBER_CAP) {
    throw new AppError("conflict", `Circles can have up to ${MEMBER_CAP} members.`);
  }
  if (targetEmail) await assertNotBlocked(ownerId, targetEmail);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [row] = await db()
    .insert(invitations)
    .values({ circleId, inviterId: ownerId, tokenHash: sha256(token), targetEmail, expiresAt })
    .returning({ id: invitations.id });
  return { id: row.id, token, expiresAt };
}

/** Blocking prevents new direct invitations in either direction (FR08). */
async function assertNotBlocked(inviterId: string, targetEmail: string): Promise<void> {
  const [target] = await db().select({ id: users.id }).from(users).where(eq(users.email, targetEmail));
  if (!target) return;
  const rows = await db()
    .select({ a: blocks.blockerId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, target.id), eq(blocks.blockedId, inviterId)),
        and(eq(blocks.blockerId, inviterId), eq(blocks.blockedId, target.id)),
      ),
    );
  if (rows.length) throw new AppError("forbidden", "You can't invite this person.");
}

type InviteRow = typeof invitations.$inferSelect;

function isUsable(invite: InviteRow | undefined, userEmail: string): invite is InviteRow {
  if (!invite) return false;
  if (invite.usedAt || invite.revokedAt || invite.declinedAt) return false;
  if (invite.expiresAt.getTime() <= Date.now()) return false;
  return !invite.targetEmail || invite.targetEmail === userEmail;
}

async function findByToken(token: string): Promise<InviteRow | undefined> {
  const [row] = await db().select().from(invitations).where(eq(invitations.tokenHash, sha256(token)));
  return row;
}

export interface InvitePreview {
  circleName: string;
  inviterName: string;
  members: string[];
  expiresAt: string;
}

/** Shows circle, inviter and current audience before joining (J1). Invalid tokens disclose nothing. */
export async function previewInvite(token: string, user: { id: string; email: string }): Promise<InvitePreview> {
  const invite = await findByToken(token);
  if (!isUsable(invite, user.email)) throw new AppError("not_found", INVALID_INVITE);
  const [circle] = await db()
    .select({ name: circles.name, deletedAt: circles.deletedAt })
    .from(circles)
    .where(eq(circles.id, invite.circleId));
  if (!circle || circle.deletedAt) throw new AppError("not_found", INVALID_INVITE);
  const [inviter] = await db().select({ name: users.displayName }).from(users).where(eq(users.id, invite.inviterId));
  const members = await activeMembers(invite.circleId);
  return {
    circleName: circle.name,
    inviterName: inviter?.name ?? "Someone",
    members: members.map((m) => m.displayName),
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function acceptInvite(token: string, user: { id: string; email: string }): Promise<{ circleId: string }> {
  return db().transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, sha256(token)))
      .for("update");
    if (!isUsable(invite, user.email)) throw new AppError("not_found", INVALID_INVITE);
    if ((await activeMemberCount(invite.circleId, tx)) >= MEMBER_CAP) {
      throw new AppError("conflict", "This circle is full.");
    }
    const now = new Date();
    await tx
      .insert(memberships)
      .values({ circleId: invite.circleId, userId: user.id, role: "member" })
      .onConflictDoUpdate({
        target: [memberships.circleId, memberships.userId],
        set: { removedAt: null, joinedAt: now, role: "member", lastReadAt: null },
      });
    await tx.update(invitations).set({ usedAt: now, usedBy: user.id }).where(eq(invitations.id, invite.id));
    return { circleId: invite.circleId };
  });
}

export async function declineInvite(token: string, user: { id: string; email: string }): Promise<void> {
  const invite = await findByToken(token);
  if (!isUsable(invite, user.email)) return;
  await db().update(invitations).set({ declinedAt: new Date() }).where(eq(invitations.id, invite.id));
}

export async function revokeInvite(ownerId: string, circleId: string, inviteId: string): Promise<void> {
  await requireOwner(ownerId, circleId);
  await db()
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, inviteId), eq(invitations.circleId, circleId)));
}

export interface PendingInvite {
  id: string;
  targetEmail: string | null;
  expiresAt: Date;
}

export async function listPendingInvites(ownerId: string, circleId: string): Promise<PendingInvite[]> {
  await requireOwner(ownerId, circleId);
  return db()
    .select({ id: invitations.id, targetEmail: invitations.targetEmail, expiresAt: invitations.expiresAt })
    .from(invitations)
    .where(
      and(
        eq(invitations.circleId, circleId),
        isNull(invitations.usedAt),
        isNull(invitations.revokedAt),
        isNull(invitations.declinedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invitations.createdAt));
}

/** Invitations addressed to this user's email, for the home screen. Token is never re-shown. */
export async function countInvitesForEmail(emailAddress: string): Promise<number> {
  const rows = await db()
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.targetEmail, emailAddress),
        isNull(invitations.usedAt),
        isNull(invitations.revokedAt),
        isNull(invitations.declinedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );
  return rows.length;
}
