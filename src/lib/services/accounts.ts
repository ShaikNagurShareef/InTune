import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { preferences, users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { PreferencesInput } from "@/lib/validation";

export interface NewAccount {
  email: string;
  password: string;
  displayName: string;
}

export async function signUp(input: NewAccount): Promise<{ id: string }> {
  const passwordHash = await hashPassword(input.password);
  return db().transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email));
    if (existing) throw new AppError("conflict", "An account with this email already exists. Try signing in.");
    const [user] = await tx
      .insert(users)
      .values({ email: input.email, displayName: input.displayName, passwordHash })
      .returning({ id: users.id });
    await tx.insert(preferences).values({ userId: user.id });
    return user;
  });
}

const INVALID_LOGIN = "Email or password is not correct.";

export async function signIn(email: string, password: string): Promise<{ id: string }> {
  const [user] = await db()
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)));
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError("unauthenticated", INVALID_LOGIN);
  }
  return { id: user.id };
}

export type Preferences = typeof preferences.$inferSelect;

export async function getPreferences(userId: string): Promise<Preferences> {
  const [row] = await db().select().from(preferences).where(eq(preferences.userId, userId));
  if (row) return row;
  const [created] = await db().insert(preferences).values({ userId }).onConflictDoNothing().returning();
  return created ?? (await getPreferences(userId));
}

/** Optimistic concurrency: a stale version reports a conflicting update (spec §2 "My communication"). */
export async function updatePreferences(userId: string, input: PreferencesInput): Promise<Preferences> {
  const { expected_version: expectedVersion, ...fields } = input;
  const [row] = await db()
    .update(preferences)
    .set({ ...fields, version: expectedVersion + 1, updatedAt: new Date() })
    .where(and(eq(preferences.userId, userId), eq(preferences.version, expectedVersion)))
    .returning();
  if (!row) throw new AppError("stale_version", "Your settings changed somewhere else. Reload to see the latest.");
  return row;
}

export async function resetPreferences(userId: string): Promise<Preferences> {
  const current = await getPreferences(userId);
  const [row] = await db()
    .update(preferences)
    .set({
      inputMode: "type",
      textSize: "md",
      sentenceLength: "medium",
      audioRate: 1,
      reduceMotion: false,
      quietMode: false,
      locale: "en",
      version: current.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(preferences.userId, userId))
    .returning();
  return row;
}
