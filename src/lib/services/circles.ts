import { and, asc, count, desc, eq, gt, gte, isNull, ne, notInArray, sql } from "drizzle-orm";
import { db, type Db } from "@/lib/db";
import { blocks, circles, memberships, messages, preferences, users } from "@/lib/db/schema";
import type { CommCard } from "@/lib/social";
import { AppError } from "@/lib/errors";
import { requireMember, requireOwner } from "@/lib/authz";
import { closeCircleCalls, liveCircleIds, removeFromCall } from "./calls";

export const MEMBER_CAP = 20;

export async function createCircle(userId: string, name: string): Promise<{ id: string }> {
  return db().transaction(async (tx) => {
    const [circle] = await tx.insert(circles).values({ name, ownerId: userId }).returning({ id: circles.id });
    await tx.insert(memberships).values({ circleId: circle.id, userId, role: "owner" });
    return circle;
  });
}

export type CircleKind = "group" | "direct";

export interface LastMessage {
  text: string | null;
  senderName: string;
  mine: boolean;
  at: string;
}

export interface CircleSummary {
  id: string;
  kind: CircleKind;
  name: string;
  role: string;
  unread: number;
  memberCount: number;
  otherUserId: string | null;
  otherStatus: string | null;
  /** A call is in progress in this chat. */
  live: boolean;
  last: LastMessage | null;
  lastActivity: string;
}

async function blockedIds(userId: string): Promise<string[]> {
  const rows = await db().select({ id: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, userId));
  return rows.map((r) => r.id);
}

/** For a direct chat, the other person (display name and id); for groups, null. */
async function otherMember(
  userId: string,
  circleId: string,
): Promise<{ id: string; displayName: string; status: string } | null> {
  const [row] = await db()
    .select({ id: users.id, displayName: users.displayName, status: sql<string>`coalesce(${preferences.status}, 'none')` })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(preferences, eq(preferences.userId, users.id))
    .where(and(eq(memberships.circleId, circleId), ne(memberships.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function lastVisibleMessage(
  userId: string,
  circleId: string,
  joinedAt: Date,
  hidden: string[],
): Promise<LastMessage | null> {
  const [row] = await db()
    .select({ m: messages, senderName: users.displayName })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(
      and(
        eq(messages.circleId, circleId),
        gte(messages.createdAt, joinedAt),
        hidden.length ? notInArray(messages.senderId, hidden) : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);
  if (!row) return null;
  return {
    text: row.m.deletedAt ? null : row.m.text.slice(0, 120),
    senderName: row.senderName,
    mine: row.m.senderId === userId,
    at: row.m.createdAt.toISOString(),
  };
}

/** Chat list: circles and direct chats together, most recent activity first (like a messaging inbox). */
export async function listCircles(userId: string): Promise<CircleSummary[]> {
  const rows = await db()
    .select({
      id: circles.id,
      name: circles.name,
      kind: circles.kind,
      createdAt: circles.createdAt,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
      since: sql<Date>`coalesce(${memberships.lastReadAt}, ${memberships.joinedAt})`,
    })
    .from(memberships)
    .innerJoin(circles, eq(circles.id, memberships.circleId))
    .where(and(eq(memberships.userId, userId), isNull(memberships.removedAt), isNull(circles.deletedAt)))
    .orderBy(asc(circles.name));
  const hidden = await blockedIds(userId);
  const live = await liveCircleIds(userId);
  const summaries = await Promise.all(
    rows.map(async (row): Promise<CircleSummary | null> => {
      const other = row.kind === "direct" ? await otherMember(userId, row.id) : null;
      // A direct chat with someone you blocked disappears from your list.
      if (other && hidden.includes(other.id)) return null;
      const [{ n }] = await db()
        .select({ n: count() })
        .from(messages)
        .where(
          and(
            eq(messages.circleId, row.id),
            gt(messages.createdAt, new Date(row.since)),
            ne(messages.senderId, userId),
            isNull(messages.deletedAt),
            hidden.length ? notInArray(messages.senderId, hidden) : undefined,
          ),
        );
      const last = await lastVisibleMessage(userId, row.id, row.joinedAt, hidden);
      return {
        id: row.id,
        kind: row.kind as CircleKind,
        name: other ? other.displayName : row.name,
        role: row.role,
        unread: Number(n),
        memberCount: await activeMemberCount(row.id),
        otherUserId: other?.id ?? null,
        otherStatus: other?.status ?? null,
        live: live.has(row.id),
        last,
        lastActivity: last?.at ?? new Date(row.createdAt).toISOString(),
      };
    }),
  );
  return summaries
    .filter((s): s is CircleSummary => s !== null)
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export interface MemberInfo {
  id: string;
  displayName: string;
  role: string;
  status: string;
  commCard: CommCard | null;
}

export interface CircleDetail {
  id: string;
  name: string;
  kind: CircleKind;
  role: string;
  members: MemberInfo[];
}

export async function getCircle(userId: string, circleId: string): Promise<CircleDetail> {
  const me = await requireMember(userId, circleId);
  const [circle] = await db()
    .select({ id: circles.id, name: circles.name, kind: circles.kind })
    .from(circles)
    .where(eq(circles.id, circleId));
  const members = await activeMembers(circleId);
  const other = circle.kind === "direct" ? members.find((m) => m.id !== userId) : undefined;
  return { id: circle.id, name: other?.displayName ?? circle.name, kind: circle.kind as CircleKind, role: me.role, members };
}

export async function activeMembers(circleId: string): Promise<MemberInfo[]> {
  const rows = await db()
    .select({
      id: users.id,
      displayName: users.displayName,
      role: memberships.role,
      status: sql<string>`coalesce(${preferences.status}, 'none')`,
      commCard: preferences.commCard,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(preferences, eq(preferences.userId, users.id))
    .where(and(eq(memberships.circleId, circleId), isNull(memberships.removedAt)))
    .orderBy(asc(memberships.joinedAt));
  return rows.map((r) => ({ ...r, commCard: (r.commCard as CommCard | null) ?? null }));
}

export async function markRead(userId: string, circleId: string): Promise<void> {
  await requireMember(userId, circleId);
  await db()
    .update(memberships)
    .set({ lastReadAt: new Date() })
    .where(and(eq(memberships.circleId, circleId), eq(memberships.userId, userId)));
}

export async function removeMember(ownerId: string, circleId: string, memberId: string): Promise<void> {
  await requireOwner(ownerId, circleId);
  if (memberId === ownerId) throw new AppError("conflict", "Transfer ownership or delete the circle instead.");
  const updated = await db()
    .update(memberships)
    .set({ removedAt: new Date() })
    .where(and(eq(memberships.circleId, circleId), eq(memberships.userId, memberId), isNull(memberships.removedAt)))
    .returning({ id: memberships.id });
  if (!updated.length) throw new AppError("not_found", "This person is not in the circle.");
  await removeFromCall(circleId, [memberId]);
}

export async function leaveCircle(userId: string, circleId: string): Promise<void> {
  const me = await requireMember(userId, circleId);
  const [circle] = await db().select({ kind: circles.kind }).from(circles).where(eq(circles.id, circleId));
  if (circle?.kind === "direct") {
    throw new AppError("conflict", "Direct chats can't be left. Block the person if you don't want their messages.");
  }
  if (me.role === "owner") {
    throw new AppError("conflict", "As the owner, transfer ownership or delete the circle before leaving.");
  }
  await db()
    .update(memberships)
    .set({ removedAt: new Date() })
    .where(and(eq(memberships.circleId, circleId), eq(memberships.userId, userId)));
  await removeFromCall(circleId, [userId]);
}

export async function transferOwnership(ownerId: string, circleId: string, newOwnerId: string): Promise<void> {
  await requireOwner(ownerId, circleId);
  await requireMember(newOwnerId, circleId).catch(() => {
    throw new AppError("invalid_input", "The new owner must be a current member.");
  });
  await db().transaction(async (tx) => {
    await tx
      .update(memberships)
      .set({ role: "member" })
      .where(and(eq(memberships.circleId, circleId), eq(memberships.userId, ownerId)));
    await tx
      .update(memberships)
      .set({ role: "owner" })
      .where(and(eq(memberships.circleId, circleId), eq(memberships.userId, newOwnerId)));
    await tx.update(circles).set({ ownerId: newOwnerId }).where(eq(circles.id, circleId));
  });
}

export async function deleteCircle(ownerId: string, circleId: string): Promise<void> {
  await requireOwner(ownerId, circleId);
  await db().update(circles).set({ deletedAt: new Date() }).where(eq(circles.id, circleId));
  await closeCircleCalls(circleId);
}

export async function activeMemberCount(circleId: string, conn: Db = db()): Promise<number> {
  const [{ n }] = await conn
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.circleId, circleId), isNull(memberships.removedAt)));
  return Number(n);
}
