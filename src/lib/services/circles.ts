import { and, asc, eq, gt, isNull, ne, notInArray, sql, count } from "drizzle-orm";
import { db, type Db } from "@/lib/db";
import { blocks, circles, memberships, messages, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { requireMember, requireOwner } from "@/lib/authz";

export const MEMBER_CAP = 20;

export async function createCircle(userId: string, name: string): Promise<{ id: string }> {
  return db().transaction(async (tx) => {
    const [circle] = await tx.insert(circles).values({ name, ownerId: userId }).returning({ id: circles.id });
    await tx.insert(memberships).values({ circleId: circle.id, userId, role: "owner" });
    return circle;
  });
}

export interface CircleSummary {
  id: string;
  name: string;
  role: string;
  unread: number;
}

async function blockedIds(userId: string): Promise<string[]> {
  const rows = await db().select({ id: blocks.blockedId }).from(blocks).where(eq(blocks.blockerId, userId));
  return rows.map((r) => r.id);
}

export async function listCircles(userId: string): Promise<CircleSummary[]> {
  const rows = await db()
    .select({
      id: circles.id,
      name: circles.name,
      role: memberships.role,
      since: sql<Date>`coalesce(${memberships.lastReadAt}, ${memberships.joinedAt})`,
    })
    .from(memberships)
    .innerJoin(circles, eq(circles.id, memberships.circleId))
    .where(and(eq(memberships.userId, userId), isNull(memberships.removedAt), isNull(circles.deletedAt)))
    .orderBy(asc(circles.name));
  const hidden = await blockedIds(userId);
  return Promise.all(
    rows.map(async (row) => {
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
      return { id: row.id, name: row.name, role: row.role, unread: Number(n) };
    }),
  );
}

export interface CircleDetail {
  id: string;
  name: string;
  role: string;
  members: { id: string; displayName: string; role: string }[];
}

export async function getCircle(userId: string, circleId: string): Promise<CircleDetail> {
  const me = await requireMember(userId, circleId);
  const [circle] = await db().select({ id: circles.id, name: circles.name }).from(circles).where(eq(circles.id, circleId));
  return { ...circle, role: me.role, members: await activeMembers(circleId) };
}

export async function activeMembers(circleId: string): Promise<CircleDetail["members"]> {
  return db()
    .select({ id: users.id, displayName: users.displayName, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.circleId, circleId), isNull(memberships.removedAt)))
    .orderBy(asc(memberships.joinedAt));
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
}

export async function leaveCircle(userId: string, circleId: string): Promise<void> {
  const me = await requireMember(userId, circleId);
  if (me.role === "owner") {
    throw new AppError("conflict", "As the owner, transfer ownership or delete the circle before leaving.");
  }
  await db()
    .update(memberships)
    .set({ removedAt: new Date() })
    .where(and(eq(memberships.circleId, circleId), eq(memberships.userId, userId)));
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
}

export async function activeMemberCount(circleId: string, conn: Db = db()): Promise<number> {
  const [{ n }] = await conn
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.circleId, circleId), isNull(memberships.removedAt)));
  return Number(n);
}
