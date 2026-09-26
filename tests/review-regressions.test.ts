import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { drafts } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { requireOwner } from "@/lib/authz";
import { createCircle } from "@/lib/services/circles";
import { acceptInvite, createInvite } from "@/lib/services/invites";
import { getMessageForMember } from "@/lib/services/messages";
import { createDraft, updateDraft } from "@/lib/services/drafts";
import { approveDraft, publishMessage } from "@/lib/services/publish";
import { circleWithMembers, freshDb, makeUser } from "./helpers";

const isCode = (code: string) => (e: unknown) => e instanceof AppError && e.code === code;
const manual = (circleId: string, text: string, key: string, replyToId: string | null = null) => ({
  circleId, text, replyToId, idempotencyKey: key, draftId: null, approvalId: null,
});

describe("review regressions", () => {
  beforeEach(freshDb);

  it("an owner accepting their own invite stays owner and the invite is not consumed", async () => {
    const { a, circleId } = await circleWithMembers();
    const { token } = await createInvite(a.id, circleId, null);
    await acceptInvite(token, a);
    await expect(requireOwner(a.id, circleId)).resolves.toBeTruthy();
    const d = await makeUser("Dee");
    await expect(acceptInvite(token, d)).resolves.toEqual({ circleId });
  });

  it("new members cannot fetch pre-join messages by id", async () => {
    const { a, circleId } = await circleWithMembers();
    const { messageId } = await publishMessage(a.id, manual(circleId, "before", "key-prejoin01"));
    const d = await makeUser("Dee");
    const { token } = await createInvite(a.id, circleId, d.email);
    await new Promise((r) => setTimeout(r, 5));
    await acceptInvite(token, d);
    await expect(getMessageForMember(d.id, messageId)).rejects.toSatisfy(isCode("not_found"));
  });

  it("replies must target a message in the same circle", async () => {
    const { a, circleId } = await circleWithMembers();
    const other = await createCircle(a.id, "Elsewhere");
    const { messageId } = await publishMessage(a.id, manual(other.id, "secret", "key-other001"));
    await expect(publishMessage(a.id, manual(circleId, "hi", "key-reply001", messageId))).rejects.toSatisfy(isCode("not_found"));
  });

  it("one approved draft cannot be sent twice under different keys", async () => {
    const { a, circleId } = await circleWithMembers();
    const draft = await createDraft(a.id, { circleId, replyToId: null, sourceMode: "type", sourceText: "x" });
    const edited = await updateDraft(a.id, draft.id, { expectedVersion: 1, text: "assisted" });
    await db().update(drafts).set({ aiAssisted: true }).where(eq(drafts.id, draft.id));
    const { approvalId } = await approveDraft(a.id, draft.id, edited.version, edited.text, false);
    const base = { circleId, text: edited.text, replyToId: null, draftId: draft.id, approvalId };
    const results = await Promise.allSettled([
      publishMessage(a.id, { ...base, idempotencyKey: "key-twice-aa" }),
      publishMessage(a.id, { ...base, idempotencyKey: "key-twice-bb" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});
