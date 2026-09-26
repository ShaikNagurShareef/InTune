import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { readCookie, SESSION_COOKIE, verifySessionToken } from "./session";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

export async function loadActiveUser(userId: string | null): Promise<SessionUser | null> {
  if (!userId) return null;
  const [row] = await db()
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Route handlers: resolve the session from the request cookie. Expired or deleted → 401 (FR01). */
export async function requireUser(req: Request): Promise<SessionUser> {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  const user = await loadActiveUser(await verifySessionToken(token));
  if (!user) throw new AppError("unauthenticated", "Please sign in again. Your draft is kept on this device.");
  return user;
}
