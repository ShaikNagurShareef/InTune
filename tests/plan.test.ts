import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { setGeminiTransport, type GenerateRequest } from "@/lib/gemini/client";
import { PLAN_SYSTEM, type PlanOutput } from "@/lib/gemini/prompts";
import { setCommCard } from "@/lib/services/accounts";
import { openDirect } from "@/lib/services/direct";
import { listMessages } from "@/lib/services/messages";
import { blockUser } from "@/lib/services/moderation";
import { approveDraft, publishMessage } from "@/lib/services/publish";
import { draftPlan, formatPlan, sanitizePlan } from "@/lib/services/plan";
import { circleWithMembers, creds, freshDb } from "./helpers";

const isCode = (code: string) => (e: unknown) => e instanceof AppError && e.code === code;
let n = 0;
const say = (userId: string, circleId: string, text: string) =>
  publishMessage(userId, { circleId, text, replyToId: null, idempotencyKey: `plan-key-${++n}-xxxx`, draftId: null, approvalId: null });

const reply: PlanOutput = {
  title: "Sunday picnic",
  when: "Sunday 10:00 am to 12:00 pm",
  where: "The botanical garden",
  what: "Picnic",
  bring: [
    { who: "Ben", item: "snacks" },
    { who: "Zed", item: "a speaker" }, // not a member: dropped
  ],
  comfort: [{ who: "Ana", need: "quiet", how: "We sit away from the café" }],
  open_questions: [{ question: "Does 10:00 am work?", ask: "everyone" }],
  suggestions: ["Morning is less busy"],
};

function stubPlan(seen: GenerateRequest[] = []) {
  setGeminiTransport({
    async generate(_c, req) {
      seen.push(req);
      expect(req.system).toBe(PLAN_SYSTEM);
      return JSON.stringify(reply);
    },
  });
  return seen;
}

describe("plan it together", () => {
  beforeEach(freshDb);

  it("drafts a plan from the chat and members' shared cards, but posts nothing", async () => {
    const { a, b, circleId } = await circleWithMembers();
    await setCommCard(a.id, { chips: ["Ask me direct questions"], note: "Quiet places please." });
    await say(a.id, circleId, "Sunday works. Somewhere quiet please.");
    await say(b.id, circleId, "I can bring snacks.");
    const seen = stubPlan();

    const { plan, draft } = await draftPlan(b.id, circleId, "a weekend picnic", creds);

    const input = JSON.parse(seen[0].parts[0].text ?? "{}");
    expect(input.goal).toBe("a weekend picnic");
    expect(input.messages.map((m: { text: string }) => m.text)).toEqual(["Sunday works. Somewhere quiet please.", "I can bring snacks."]);
    expect(input.members.find((m: { name: string }) => m.name === "Ana").how_to_talk_with_me).toContain("Quiet places please.");
    expect(plan.bring).toEqual([{ who: "Ben", item: "snacks" }]);
    expect(plan.basedOn).toBe(2);
    expect(draft).toMatchObject({ ownerId: b.id, aiAssisted: true, status: "DRAFT" });
    expect(draft.text).toContain("📋 Plan: Sunday picnic");
    expect((await listMessages(a.id, circleId, null)).messages).toHaveLength(2);
  });

  it("can only be posted after the organiser approves the exact text", async () => {
    const { b, circleId } = await circleWithMembers();
    stubPlan();
    const { draft } = await draftPlan(b.id, circleId, "", creds);
    const post = (approvalId: string | null) =>
      publishMessage(b.id, { circleId, text: draft.text, replyToId: null, idempotencyKey: `plan-post-${++n}-xxxx`, draftId: draft.id, approvalId });
    await expect(post(null)).rejects.toSatisfy(isCode("conflict"));
    const { approvalId } = await approveDraft(b.id, draft.id, draft.version, draft.text, false);
    const sent = await post(approvalId);
    const [message] = (await listMessages(b.id, circleId, null)).messages.filter((m) => m.id === sent.messageId);
    expect(message).toMatchObject({ aiAssisted: true, approvedBySender: true });
  });

  it("is only for members, and not across a block in a direct chat", async () => {
    const { a, b, c, circleId } = await circleWithMembers();
    stubPlan();
    await expect(draftPlan(c.id, circleId, "", creds)).rejects.toSatisfy(isCode("not_found"));
    const { id } = await openDirect(a.id, b.id);
    await blockUser(b.id, a.id);
    await expect(draftPlan(a.id, id, "", creds)).rejects.toSatisfy(isCode("forbidden"));
  });

  it("keeps only real members, caps lists, and lays the plan out plainly", () => {
    const members = [
      { id: "1", displayName: "Ana Lopez", role: "owner", status: "none", commCard: null },
      { id: "2", displayName: "Ben Ito", role: "member", status: "none", commCard: null },
    ];
    const plan = sanitizePlan(
      { ...reply, open_questions: [...reply.open_questions, { question: "Who drives?", ask: "Zed" }], when: "", where: "" },
      members,
      5,
    );
    expect(plan.bring).toEqual([{ who: "Ben", item: "snacks" }]);
    expect(plan.openQuestions.map((q) => q.ask)).toEqual(["everyone", "everyone"]);
    const text = formatPlan(plan);
    expect(text).not.toContain("When:");
    expect(text).toContain("• We sit away from the café (Ana)");
    expect(text).toContain("Still to decide:\n• Does 10:00 am work?");
    expect(text).not.toContain("Morning is less busy"); // ideas stay private to the organiser
  });
});
