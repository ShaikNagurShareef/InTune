import { and, eq, isNull } from "drizzle-orm";
import { db, type Db } from "@/lib/db";
import { circles, memberships } from "@/lib/db/schema";
import { AppError, notFound } from "@/lib/errors";

export interface ActiveMembership {
  circleId: string;
  userId: string;
  role: string;
  joinedAt: Date;
  lastReadAt: Date | null;
}

export async function findActiveMembership(
  userId: string,
  circleId: string,
  conn: Db = db(),
): Promise<ActiveMembership | null> {
  const [row] = await conn
    .select({
      circleId: memberships.circleId,
      userId: memberships.userId,
      role: memberships.role,
      joinedAt: memberships.joinedAt,
      lastReadAt: memberships.lastReadAt,
    })
    .from(memberships)
    .innerJoin(circles, eq(circles.id, memberships.circleId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.circleId, circleId),
        isNull(memberships.removedAt),
        isNull(circles.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Non-members get the same 404 as a missing circle, so membership is not disclosed (FR03). */
export async function requireMember(userId: string, circleId: string, conn: Db = db()): Promise<ActiveMembership> {
  const m = await findActiveMembership(userId, circleId, conn);
  if (!m) throw notFound();
  return m;
}

export async function requireOwner(userId: string, circleId: string, conn: Db = db()): Promise<ActiveMembership> {
  const m = await requireMember(userId, circleId, conn);
  if (m.role !== "owner") throw new AppError("forbidden", "Only the circle owner can do this.");
  return m;
}
