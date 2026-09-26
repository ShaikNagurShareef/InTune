import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Db } from "@/lib/db";
import { blocks, circles, memberships, users } from "@/lib/db/schema";
import { AppError, notFound } from "@/lib/errors";

export interface Contact {
  id: string;
  displayName: string;
}

const CANNOT_MESSAGE = "You can't message this person.";

export const directKey = (a: string, b: string): string => [a, b].sort().join(":");

async function blockedEitherWay(conn: Db, a: string, b: string): Promise<boolean> {
  const rows = await conn
    .select({ x: blocks.blockerId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
        and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * People you may start a direct chat with: active members of your group circles.
 * There is no public directory (public discovery is out of scope), and blocks hide people both ways.
 */
export async function listContacts(userId: string): Promise<Contact[]> {
  const mine = alias(memberships, "mine");
  const rows = await db()
    .selectDistinct({ id: users.id, displayName: users.displayName })
    .from(mine)
    .innerJoin(circles, and(eq(circles.id, mine.circleId), eq(circles.kind, "group"), isNull(circles.deletedAt)))
    .innerJoin(memberships, and(eq(memberships.circleId, circles.id), isNull(memberships.removedAt)))
    .innerJoin(users, and(eq(users.id, memberships.userId), isNull(users.deletedAt)))
    .where(and(eq(mine.userId, userId), isNull(mine.removedAt), ne(memberships.userId, userId)))
    .orderBy(asc(users.displayName));
  if (!rows.length) return [];
  const blocked = await db()
    .select({ a: blocks.blockerId, b: blocks.blockedId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, userId), inArray(blocks.blockedId, rows.map((r) => r.id))),
        and(eq(blocks.blockedId, userId), inArray(blocks.blockerId, rows.map((r) => r.id))),
      ),
    );
  const hidden = new Set(blocked.map((r) => (r.a === userId ? r.b : r.a)));
  return rows.filter((r) => !hidden.has(r.id));
}

/** Opens (or creates) the one direct chat between two people who share a circle (FR08: blocks prevent it). */
export async function openDirect(userId: string, otherId: string): Promise<{ id: string }> {
  if (otherId === userId) throw new AppError("invalid_input", "Choose someone else to message.");
  const contacts = await listContacts(userId);
  if (!contacts.some((c) => c.id === otherId)) throw notFound();
  if (await blockedEitherWay(db(), userId, otherId)) throw new AppError("forbidden", CANNOT_MESSAGE);

  const key = directKey(userId, otherId);
  return db().transaction(async (tx) => {
    await tx
      .insert(circles)
      .values({ name: "Direct chat", kind: "direct", ownerId: userId, directKey: key })
      .onConflictDoNothing({ target: circles.directKey });
    const [circle] = await tx.select({ id: circles.id }).from(circles).where(eq(circles.directKey, key));
    for (const member of [userId, otherId]) {
      await tx
        .insert(memberships)
        .values({ circleId: circle.id, userId: member, role: "member" })
        .onConflictDoNothing({ target: [memberships.circleId, memberships.userId] });
    }
    return circle;
  });
}

/** Sending into a direct chat is refused while either person has blocked the other. */
export async function assertCanSendDirect(conn: Db, userId: string, circleId: string): Promise<void> {
  const [circle] = await conn.select({ kind: circles.kind }).from(circles).where(eq(circles.id, circleId));
  if (circle?.kind !== "direct") return;
  const others = await conn
    .select({ id: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.circleId, circleId), ne(memberships.userId, userId)));
  for (const o of others) {
    if (await blockedEitherWay(conn, userId, o.id)) throw new AppError("forbidden", CANNOT_MESSAGE);
  }
}
