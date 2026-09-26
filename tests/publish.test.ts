import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { messages } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { createDraft, updateDraft } from "@/lib/services/drafts";
import { approveDraft, publishMessage } from "@/lib/services/publish";
import { removeMember } from "@/lib/services/circles";
import { acceptInvite, createInvite } from "@/lib/services/invites";
import { circleWithMembers, freshDb, makeUser } from "./helpers";

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

async function assistedDraft(userId: string, circleId: string, text: string) {
  const draft = await createDraft(userId, { circleId, replyToId: null, sourceMode: "type", sourceText: "orig" });
  const edited = await updateDraft(userId, draft.id, { expectedVersion: draft.version, text });
  await db().update((await import("@/lib/db/schema")).drafts).set({ aiAssisted: true }).where(eq((await import("@/lib/db/schema")).drafts.id, draft.id));
  return edited;
}

describe("publishMessage", () => {
  beforeEach(freshDb);

  it("returns the same message id when a manual send is retried with the same key", async () => {
    const { a, circleId } = await circleWithMembers();
    const input = { circleId, text: "Hi all", replyToId: null, idempotencyKey: "key-00000001", draftId: null, approvalId: null };
    const first = await publishMessage(a.id, input);
    const second = await publishMessage(a.id, input);
    expect(second.messageId).toBe(first.messageId);
    expect(second.replayed).toBe(true);
    expect(await db().select().from(messages)).toHaveLength(1);
  });

  it("produces one post for 20 concurrent sends with one key", async () => {
    const { a, circleId } = await circleWithMembers();
    const input = { circleId, text: "Once", replyToId: null, idempotencyKey: "key-concurrent", draftId: null, approvalId: null };
    const results = await Promise.all(Array.from({ length: 20 }, () => publishMessage(a.id, input)));
    expect(new Set(results.map((r) => r.messageId)).size).toBe(1);
    expect(await db().select().from(messages)).toHaveLength(1);
  });

  it("rejects a reused key with a different payload (409)", async () => {
    const { a, circleId } = await circleWithMembers();
    const base = { circleId, replyToId: null, idempotencyKey: "key-00000002", draftId: null, approvalId: null };
    await publishMessage(a.id, { ...base, text: "one" });
    await expectCode(publishMessage(a.id, { ...base, text: "two" }), "conflict");
  });

  it("refuses to send an AI-assisted draft without approval", async () => {
    const { a, circleId } = await circleWithMembers();
    const draft = await assistedDraft(a.id, circleId, "Assisted words");
    await expectCode(
      publishMessage(a.id, { circleId, text: draft.text, replyToId: null, idempotencyKey: "key-noapproval", draftId: draft.id, approvalId: null }),
      "conflict",
    );
  });

  it("sends an approved draft once and marks it AI-assisted", async () => {
    const { a, circleId } = await circleWithMembers();
    const draft = await assistedDraft(a.id, circleId, "Assisted words");
    const { approvalId } = await approveDraft(a.id, draft.id, draft.version, draft.text, false);
    const res = await publishMessage(a.id, { circleId, text: draft.text, replyToId: null, idempotencyKey: "key-approved1", draftId: draft.id, approvalId });
    const [row] = await db().select().from(messages).where(eq(messages.id, res.messageId));
    expect(row.aiAssisted).toBe(true);
    expect(row.approvalId).toBe(approvalId);
  });

  it("invalidates approval when the text is edited after approving", async () => {
    const { a, circleId } = await circleWithMembers();
    const draft = await assistedDraft(a.id, circleId, "Assisted words");
    const { approvalId } = await approveDraft(a.id, draft.id, draft.version, draft.text, false);
    const edited = await updateDraft(a.id, draft.id, { expectedVersion: draft.version, text: "Changed words" });
    await expectCode(
      publishMessage(a.id, { circleId, text: edited.text, replyToId: null, idempotencyKey: "key-edited01", draftId: draft.id, approvalId }),
      "stale_version",
    );
  });

  it("invalidates approval when the sent text differs from the approved text", async () => {
    const { a, circleId } = await circleWithMembers();
    const draft = await assistedDraft(a.id, circleId, "Assisted words");
    const { approvalId } = await approveDraft(a.id, draft.id, draft.version, draft.text, false);
    await expectCode(
      publishMessage(a.id, { circleId, text: "Something else", replyToId: null, idempotencyKey: "key-textdiff", draftId: draft.id, approvalId }),
      "stale_version",
    );
  });

  it("invalidates approval when the audience changes", async () => {
    const { a, circleId } = await circleWithMembers();
    const draft = await assistedDraft(a.id, circleId, "Assisted words");
    const { approvalId } = await approveDraft(a.id, draft.id, draft.version, draft.text, false);
    const d = await makeUser("Dee");
    const { token } = await createInvite(a.id, circleId, d.email);
    await acceptInvite(token, d);
    await expectCode(
      publishMessage(a.id, { circleId, text: draft.text, replyToId: null, idempotencyKey: "key-audience", draftId: draft.id, approvalId }),
      "stale_version",
    );
  });

  it("rejects approval of text other than what was previewed", async () => {
    const { a, circleId } = await circleWithMembers();
    const draft = await assistedDraft(a.id, circleId, "Assisted words");
    await expectCode(approveDraft(a.id, draft.id, draft.version, "Different preview", false), "stale_version");
  });

  it("requires acknowledging flagged meaning changes before approval", async () => {
    const { a, circleId } = await circleWithMembers();
    const draft = await assistedDraft(a.id, circleId, "I am sad and can't come");
    const schema = await import("@/lib/db/schema");
    await db().update(schema.drafts).set({ assist: { unsupported_additions: ["sad"] } }).where(eq(schema.drafts.id, draft.id));
    await expectCode(approveDraft(a.id, draft.id, draft.version, draft.text, false), "conflict");
    await expect(approveDraft(a.id, draft.id, draft.version, draft.text, true)).resolves.toBeTruthy();
  });

  it("does not let a sent draft be posted again under a new key", async () => {
    const { a, circleId } = await circleWithMembers();
    const draft = await assistedDraft(a.id, circleId, "Assisted words");
    const { approvalId } = await approveDraft(a.id, draft.id, draft.version, draft.text, false);
    const base = { circleId, text: draft.text, replyToId: null, draftId: draft.id, approvalId };
    await publishMessage(a.id, { ...base, idempotencyKey: "key-first001" });
    await expectCode(publishMessage(a.id, { ...base, idempotencyKey: "key-second01" }), "stale_version");
  });

  it("denies a removed member inside the send transaction", async () => {
    const { a, b, circleId } = await circleWithMembers();
    await removeMember(a.id, circleId, b.id);
    await expectCode(
      publishMessage(b.id, { circleId, text: "hello", replyToId: null, idempotencyKey: "key-removed1", draftId: null, approvalId: null }),
      "not_found",
    );
  });

  it("does not let another user approve or send someone else's draft", async () => {
    const { a, b, circleId } = await circleWithMembers();
    const draft = await assistedDraft(a.id, circleId, "Assisted words");
    await expectCode(approveDraft(b.id, draft.id, draft.version, draft.text, true), "not_found");
  });
});
