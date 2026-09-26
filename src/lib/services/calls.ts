import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { calls, circles, memberships } from "@/lib/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { requireMember } from "@/lib/authz";
import { rateLimit } from "@/lib/rate-limit";
import {
  EMPTY_ROOM_TIMEOUT_S,
  MAX_ROOM_PARTICIPANTS,
  joinToken,
  liveKitConfig,
  roomService,
  type LiveKitConfig,
} from "@/lib/calls/livekit";
import { assertCanSendDirect, directKey } from "./direct";

export type CallKind = "audio" | "video";

export interface CallView {
  id: string;
  circleId: string;
  kind: CallKind;
  startedAt: string;
  participants: { id: string; name: string }[];
}

type CallRow = typeof calls.$inferSelect;

/** A call nobody joined within this window (or that emptied out) is closed automatically. */
const EMPTY_GRACE_MS = 2 * 60 * 1000;
const END_LIMIT_PER_HOUR = 30;

function requireConfig(): LiveKitConfig {
  const config = liveKitConfig();
  if (!config) throw new AppError("ai_unavailable", "Calls aren’t set up on this server yet.");
  return config;
}

/** Content-free log line for call-service failures (room names are random ids, never content). */
function logCallError(action: string, err: unknown): void {
  const status = (err as { status?: unknown } | null)?.status;
  console.error(`[calls] ${action} failed`, err instanceof Error ? err.name : "error", typeof status === "number" ? status : "");
}

/**
 * Who is in the room: a list, [] when LiveKit says the room doesn't exist, or null when LiveKit
 * couldn't be asked (outage) — an unknown answer never closes a call.
 */
async function participantsOf(config: LiveKitConfig, room: string): Promise<{ id: string; name: string }[] | null> {
  try {
    const list = await roomService(config).listParticipants(room);
    return list.map((p) => ({ id: p.identity, name: p.name || "Someone" }));
  } catch (err) {
    if ((err as { status?: unknown } | null)?.status === 404) return [];
    logCallError("listParticipants", err);
    return null;
  }
}

async function touch(id: string): Promise<void> {
  await db().update(calls).set({ lastActiveAt: new Date() }).where(eq(calls.id, id));
}

async function endRow(id: string): Promise<void> {
  await db().update(calls).set({ endedAt: new Date() }).where(and(eq(calls.id, id), isNull(calls.endedAt)));
}

async function activeRow(circleId: string): Promise<CallRow | undefined> {
  const [row] = await db()
    .select()
    .from(calls)
    .where(and(eq(calls.circleId, circleId), isNull(calls.endedAt)))
    .orderBy(desc(calls.startedAt))
    .limit(1);
  return row;
}

/** Returns the live view of a call, closing it once the room has stayed empty past the grace period. */
async function view(row: CallRow): Promise<CallView | null> {
  const config = liveKitConfig();
  const participants = config ? await participantsOf(config, row.roomName) : null;
  const idle = Date.now() - row.lastActiveAt.getTime();
  if (participants?.length === 0 && idle > EMPTY_GRACE_MS) {
    await endRow(row.id);
    return null;
  }
  if (participants?.length) await touch(row.id);
  return {
    id: row.id,
    circleId: row.circleId,
    kind: row.kind as CallKind,
    startedAt: row.startedAt.toISOString(),
    participants: participants ?? [],
  };
}

async function insertOrReuse(userId: string, circleId: string, kind: CallKind): Promise<CallRow> {
  return db().transaction(async (tx) => {
    // Serialise concurrent "start call" presses in the same circle.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${circleId}))`);
    const [again] = await tx
      .select()
      .from(calls)
      .where(and(eq(calls.circleId, circleId), isNull(calls.endedAt)))
      .limit(1);
    if (again) return again;
    const [created] = await tx
      .insert(calls)
      .values({ circleId, kind, startedBy: userId, roomName: `intune-${crypto.randomUUID()}` })
      .returning();
    return created;
  });
}

/** Starts a call in a circle, or returns the one already running (one live call per circle). */
export async function startCall(userId: string, circleId: string, kind: CallKind): Promise<CallView> {
  const config = requireConfig();
  await requireMember(userId, circleId);
  await assertCanSendDirect(db(), userId, circleId);
  const existing = await activeRow(circleId);
  if (existing) {
    const live = await view(existing);
    if (live) return live;
  }
  const row = await insertOrReuse(userId, circleId, kind);
  // The room is created here, with limits, rather than implicitly by the first person to connect.
  await roomService(config)
    .createRoom({ name: row.roomName, emptyTimeout: EMPTY_ROOM_TIMEOUT_S, maxParticipants: MAX_ROOM_PARTICIPANTS })
    .catch((err: unknown) => logCallError("createRoom", err));
  return (await view(row)) ?? { id: row.id, circleId, kind, startedAt: row.startedAt.toISOString(), participants: [] };
}

/** The live call in a circle. People blocked in a direct chat don't see the other person's call. */
export async function getActiveCall(userId: string, circleId: string): Promise<CallView | null> {
  await requireMember(userId, circleId);
  const blocked = await assertCanSendDirect(db(), userId, circleId).then(
    () => false,
    () => true,
  );
  if (blocked) return null;
  const row = await activeRow(circleId);
  return row ? view(row) : null;
}

async function ownedCall(userId: string, callId: string): Promise<{ row: CallRow; role: string }> {
  const [row] = await db().select().from(calls).where(eq(calls.id, callId));
  if (!row) throw notFound();
  const member = await requireMember(userId, row.circleId);
  return { row, role: member.role };
}

/** In a group, only the person who started the call or the circle owner can end it for everyone. */
async function canEnd(userId: string, row: CallRow, role: string): Promise<boolean> {
  if (row.startedBy === userId || role === "owner") return true;
  const [circle] = await db().select({ kind: circles.kind }).from(circles).where(eq(circles.id, row.circleId));
  return circle?.kind === "direct";
}

export interface CallJoin {
  token: string;
  url: string;
  canEnd: boolean;
}

/** Issues a join token only to current members of the call's circle (blocks respected in direct chats). */
export async function callToken(user: { id: string; displayName: string }, callId: string): Promise<CallJoin> {
  const config = requireConfig();
  const { row, role } = await ownedCall(user.id, callId);
  if (row.endedAt) throw new AppError("conflict", "This call has ended.");
  await assertCanSendDirect(db(), user.id, row.circleId);
  await touch(row.id);
  return {
    token: await joinToken(config, row.roomName, user.id, user.displayName),
    url: config.url,
    canEnd: await canEnd(user.id, row, role),
  };
}

async function closeRoom(roomName: string): Promise<void> {
  const config = liveKitConfig();
  if (config) await roomService(config).deleteRoom(roomName).catch((err: unknown) => logCallError("deleteRoom", err));
}

/** Ends the call for everyone. */
export async function endCall(userId: string, callId: string): Promise<void> {
  const { row, role } = await ownedCall(userId, callId);
  await rateLimit(`call-end:${userId}`, END_LIMIT_PER_HOUR, 3600);
  if (!(await canEnd(userId, row, role))) {
    throw new AppError("forbidden", "Only the person who started the call or the circle owner can end it for everyone.");
  }
  await endRow(row.id);
  await closeRoom(row.roomName);
}

/** Marks a call ended when LiveKit reports the room finished (webhook). */
export async function endCallByRoom(roomName: string): Promise<void> {
  await db().update(calls).set({ endedAt: new Date() }).where(and(eq(calls.roomName, roomName), isNull(calls.endedAt)));
}

/** Removes people from a circle's live call at once (they left, were removed, or were blocked). */
export async function removeFromCall(circleId: string, userIds: string[]): Promise<void> {
  const config = liveKitConfig();
  const row = config ? await activeRow(circleId) : undefined;
  if (!config || !row) return;
  const rooms = roomService(config);
  await Promise.all(
    userIds.map((id) =>
      rooms.removeParticipant(row.roomName, id).catch(() => undefined), // Not in the room: nothing to do.
    ),
  );
}

/** Ends a circle's live call (the circle was deleted). */
export async function closeCircleCalls(circleId: string): Promise<void> {
  const row = await activeRow(circleId);
  if (!row) return;
  await endRow(row.id);
  await closeRoom(row.roomName);
}

/** Ends any live call in the direct chat between two people (one blocked the other). */
export async function closeDirectCall(a: string, b: string): Promise<void> {
  const [circle] = await db().select({ id: circles.id }).from(circles).where(eq(circles.directKey, directKey(a, b)));
  if (circle) await closeCircleCalls(circle.id);
}

/** Circles (of this user) with a call in progress, for the chat list's "live" badge. */
export async function liveCircleIds(userId: string): Promise<Set<string>> {
  const rows = await db()
    .select({ circleId: calls.circleId })
    .from(calls)
    .innerJoin(memberships, and(eq(memberships.circleId, calls.circleId), eq(memberships.userId, userId), isNull(memberships.removedAt)))
    .innerJoin(circles, and(eq(circles.id, calls.circleId), isNull(circles.deletedAt)))
    .where(isNull(calls.endedAt));
  return new Set(rows.map((r) => r.circleId));
}

/** The circle of a call that is still running, for members only (the interpreter only works during a call). */
export async function liveCallCircleId(userId: string, callId: string): Promise<string> {
  const { row } = await ownedCall(userId, callId);
  if (row.endedAt) throw new AppError("conflict", "This call has ended.");
  return row.circleId;
}
