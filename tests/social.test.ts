import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { drafts } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { setCommCard, setStatus } from "@/lib/services/accounts";
import { getCircle } from "@/lib/services/circles";
import { createDraft, updateDraft } from "@/lib/services/drafts";
import { listMessages } from "@/lib/services/messages";
import { approveDraft, publishMessage } from "@/lib/services/publish";
import { simplifyForReader } from "@/lib/services/reading-aid";
import { toneTags } from "@/lib/social";
import { circleWithMembers, creds, freshDb, stubGemini } from "./helpers";

const isCode = (code: string) => (e: unknown) => e instanceof AppError && e.code === code;

describe("explicit social signals", () => {
  beforeEach(freshDb);

  it("tone tags chosen by the sender reach the reader", async () => {
    const { a, b, circleId } = await circleWithMembers();
    await publishMessage(a.id, {
      circleId, text: "Can't make it", replyToId: null, idempotencyKey: "tone-key-001", draftId: null, approvalId: null,
      toneTags: ["not_upset", "no_rush"],
    });
    const [m] = (await listMessages(b.id, circleId, null)).messages;
    expect(m.toneTags).toEqual(["not_upset", "no_rush"]);
  });

  it("rejects unknown tags and caps them at three", () => {
    expect(toneTags.safeParse(["angry"]).success).toBe(false);
    expect(toneTags.safeParse(["joking", "serious", "no_rush", "not_upset"]).success).toBe(false);
  });

  it("changing tone after approval invalidates the approval", async () => {
    const { a, circleId } = await circleWithMembers();
    const draft = await createDraft(a.id, { circleId, replyToId: null, sourceMode: "type", sourceText: "x", toneTags: ["joking"] });
    const v2 = await updateDraft(a.id, draft.id, { expectedVersion: 1, text: "assisted" });
    await db().update(drafts).set({ aiAssisted: true }).where(eq(drafts.id, draft.id));
    const { approvalId } = await approveDraft(a.id, draft.id, v2.version, v2.text, false);
    const base = { circleId, text: v2.text, replyToId: null, draftId: draft.id, approvalId, idempotencyKey: "tone-key-002" };
    await expect(publishMessage(a.id, { ...base, toneTags: ["serious"] })).rejects.toSatisfy(isCode("stale_version"));
    await expect(publishMessage(a.id, { ...base, toneTags: ["joking"] })).resolves.toBeTruthy();
  });

  it("status and 'how to talk with me' are visible to circle members", async () => {
    const { a, b, c, circleId } = await circleWithMembers();
    await setStatus(a.id, "low_energy");
    await setCommCard(a.id, { chips: ["Ask me direct questions"], note: "Quiet means tired, not upset." });
    const ana = (await getCircle(b.id, circleId)).members.find((m) => m.id === a.id);
    expect(ana).toMatchObject({ status: "low_energy", commCard: { chips: ["Ask me direct questions"] } });
    await expect(getCircle(c.id, circleId)).rejects.toSatisfy(isCode("not_found"));
  });

  it("'no reply needed' from the sender outranks the model in reading help", async () => {
    const { a, b, circleId } = await circleWithMembers();
    const { messageId } = await publishMessage(a.id, {
      circleId, text: "FYI the park closes at 6. Want to come?", replyToId: null, idempotencyKey: "tone-key-003",
      draftId: null, approvalId: null, toneTags: ["no_reply_needed"],
    });
    stubGemini({}, {
      simplify: { simplified_text: "The park closes at 6.", kept_details: ["6"], asking: "Do you want to come?", reply_expected: "yes", unclear: "" },
    });
    const aid = await simplifyForReader(b.id, messageId, creds);
    expect(aid.summary).toMatchObject({ asking: "Do you want to come?", replyExpected: "no" });
  });
});
