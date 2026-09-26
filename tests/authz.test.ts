import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitations } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { sha256 } from "@/lib/hash";
import { removeMember, leaveCircle } from "@/lib/services/circles";
import { acceptInvite, createInvite, previewInvite, revokeInvite } from "@/lib/services/invites";
import { getMessageForMember, listMessages, deleteMessage, editMessage } from "@/lib/services/messages";
import { blockUser } from "@/lib/services/moderation";
import { createPhrase, findRelevantPhrases, updatePhrase } from "@/lib/services/phrasebook";
import { createDraft, getOwnedDraft } from "@/lib/services/drafts";
import { publishMessage } from "@/lib/services/publish";
import { circleWithMembers, freshDb, makeUser } from "./helpers";

const isCode = (code: string) => (e: unknown) => e instanceof AppError && e.code === code;

async function post(userId: string, circleId: string, text: string) {
  return publishMessage(userId, {
    circleId,
    text,
    replyToId: null,
    idempotencyKey: `k-${Math.random().toString(36).slice(2, 12)}`,
    draftId: null,
    approvalId: null,
  });
}

describe("community acceptance scenario (spec §3)", () => {
  beforeEach(freshDb);

  it("unrelated account C cannot fetch a post by id or list the circle", async () => {
    const { b, c, circleId } = await circleWithMembers();
    const { messageId } = await post(b.id, circleId, "Confirmed message");
    await expect(getMessageForMember(c.id, messageId)).rejects.toSatisfy(isCode("not_found"));
    await expect(listMessages(c.id, circleId, null)).rejects.toSatisfy(isCode("not_found"));
  });

  it("removed member B loses read access on the next fetch", async () => {
    const { a, b, circleId } = await circleWithMembers();
    const { messageId } = await post(a.id, circleId, "Hello");
    await removeMember(a.id, circleId, b.id);
    await expect(listMessages(b.id, circleId, null)).rejects.toSatisfy(isCode("not_found"));
    await expect(getMessageForMember(b.id, messageId)).rejects.toSatisfy(isCode("not_found"));
  });

  it("the last owner cannot leave without transferring", async () => {
    const { a, circleId } = await circleWithMembers();
    await expect(leaveCircle(a.id, circleId)).rejects.toSatisfy(isCode("conflict"));
  });

  it("new members only see posts created after they joined", async () => {
    const { a, circleId } = await circleWithMembers();
    await post(a.id, circleId, "Before D joined");
    const d = await makeUser("Dee");
    const { token } = await createInvite(a.id, circleId, d.email);
    await new Promise((r) => setTimeout(r, 5));
    await acceptInvite(token, d);
    await post(a.id, circleId, "After D joined");
    const page = await listMessages(d.id, circleId, null);
    expect(page.messages.map((m) => m.text)).toEqual(["After D joined"]);
  });

  it("pagination is stable and never duplicates", async () => {
    const { a, circleId } = await circleWithMembers();
    for (let i = 0; i < 65; i++) await post(a.id, circleId, `m${i}`);
    const p1 = await listMessages(a.id, circleId, null);
    const p2 = await listMessages(a.id, circleId, p1.nextCursor);
    const p3 = await listMessages(a.id, circleId, p2.nextCursor);
    const ids = [...p1.messages, ...p2.messages, ...p3.messages].map((m) => m.id);
    expect(p1.messages).toHaveLength(30);
    expect(new Set(ids).size).toBe(65);
    expect(p3.nextCursor).toBeNull();
  });

  it("hides blocked authors only for the blocker", async () => {
    const { a, b, circleId } = await circleWithMembers();
    await post(b.id, circleId, "from Ben");
    await blockUser(a.id, b.id);
    expect((await listMessages(a.id, circleId, null)).messages).toHaveLength(0);
    expect((await listMessages(b.id, circleId, null)).messages).toHaveLength(1);
  });

  it("deleted messages become tombstones; only the sender can delete or edit", async () => {
    const { a, b, circleId } = await circleWithMembers();
    const { messageId } = await post(a.id, circleId, "oops");
    await expect(deleteMessage(b.id, messageId)).rejects.toSatisfy(isCode("not_found"));
    await expect(editMessage(b.id, messageId, "hack", 1)).rejects.toSatisfy(isCode("not_found"));
    await deleteMessage(a.id, messageId);
    const [m] = (await listMessages(b.id, circleId, null)).messages;
    expect(m.deleted).toBe(true);
    expect(m.text).toBeNull();
  });
});

describe("invitations (FR04)", () => {
  beforeEach(freshDb);

  it("cannot be replayed", async () => {
    const { a, circleId } = await circleWithMembers();
    const d = await makeUser("Dee");
    const { token } = await createInvite(a.id, circleId, null);
    await acceptInvite(token, d);
    const e = await makeUser("Eve");
    await expect(acceptInvite(token, e)).rejects.toSatisfy(isCode("not_found"));
  });

  it("cannot be used after expiry or revocation, and is bound to the invited email", async () => {
    const { a, c, circleId } = await circleWithMembers();
    const d = await makeUser("Dee");
    const expired = await createInvite(a.id, circleId, d.email);
    await db().update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.tokenHash, sha256(expired.token)));
    await expect(acceptInvite(expired.token, d)).rejects.toSatisfy(isCode("not_found"));

    const revoked = await createInvite(a.id, circleId, d.email);
    await revokeInvite(a.id, circleId, revoked.id);
    await expect(acceptInvite(revoked.token, d)).rejects.toSatisfy(isCode("not_found"));

    const bound = await createInvite(a.id, circleId, d.email);
    await expect(previewInvite(bound.token, c)).rejects.toSatisfy(isCode("not_found"));
    await expect(acceptInvite(bound.token, c)).rejects.toSatisfy(isCode("not_found"));
  });

  it("only the owner can invite", async () => {
    const { b, circleId } = await circleWithMembers();
    await expect(createInvite(b.id, circleId, null)).rejects.toSatisfy(isCode("forbidden"));
  });
});

describe("owner scoping (SEC02, FR25)", () => {
  beforeEach(freshDb);

  it("drafts are invisible to other accounts", async () => {
    const { a, b, circleId } = await circleWithMembers();
    const draft = await createDraft(a.id, { circleId, replyToId: null, sourceMode: "type", sourceText: "hi" });
    await expect(getOwnedDraft(b.id, draft.id)).rejects.toSatisfy(isCode("not_found"));
  });

  it("phrasebook entries are never retrieved for another account", async () => {
    const { a, b } = await circleWithMembers();
    await createPhrase(a.id, { phrase: "tea time", meaning: "I want a break", example: null });
    expect(await findRelevantPhrases(b.id, "tea time")).toHaveLength(0);
    expect(await findRelevantPhrases(a.id, "is it tea time")).toHaveLength(1);
  });

  it("stale phrase revisions are rejected", async () => {
    const { a } = await circleWithMembers();
    const p = await createPhrase(a.id, { phrase: "tea time", meaning: "break", example: null });
    await updatePhrase(a.id, p.id, 1, { phrase: "tea time", meaning: "a short break", example: null });
    await expect(updatePhrase(a.id, p.id, 1, { phrase: "x", meaning: "y", example: null })).rejects.toSatisfy(
      isCode("stale_version"),
    );
  });
});
