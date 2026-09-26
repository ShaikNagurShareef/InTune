import { db } from "@/lib/db";
import { generateJson, type GeminiCredentials } from "@/lib/gemini/client";
import { PLAN_SYSTEM, planOutput, type PlanOutput } from "@/lib/gemini/prompts";
import { recordEvent } from "@/lib/metrics";
import { rateLimit } from "@/lib/rate-limit";
import { statusInfo } from "@/lib/social";
import { MAX_MESSAGE_CHARS } from "@/lib/validation";
import { getCircle, type MemberInfo } from "./circles";
import { assertCanSendDirect } from "./direct";
import { createDraft, type Draft } from "./drafts";
import { listMessages } from "./messages";

const PLAN_LIMIT_PER_HOUR = 20;
const MAX_GOAL_CHARS = 300;
const MAX_LINE_CHARS = 200;
const MAX_ITEMS = 6;
const MAX_QUESTIONS = 3;
const MAX_SUGGESTIONS = 2;

export interface GroupPlan {
  title: string;
  when: string;
  where: string;
  what: string;
  bring: { who: string; item: string }[];
  comfort: { who: string; need: string; how: string }[];
  openQuestions: { question: string; ask: string }[];
  suggestions: string[];
  /** How many recent messages the plan was drawn from. */
  basedOn: number;
}

export interface PlanResult {
  plan: GroupPlan;
  /** An AI-assisted draft of the plan's text; posting it still needs the organiser's exact approval. */
  draft: Draft;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, MAX_LINE_CHARS);

/** Maps a model-written name to a real member (full or first name); anything else is dropped. */
function memberMatcher(members: MemberInfo[]) {
  const byName = new Map<string, string>();
  for (const m of members) {
    byName.set(m.displayName.toLowerCase(), firstName(m.displayName));
    byName.set(firstName(m.displayName).toLowerCase(), firstName(m.displayName));
  }
  return (name: string, allowEveryone = false): string | null => {
    const key = name.trim().toLowerCase();
    if (allowEveryone && (key === "everyone" || key === "all")) return "everyone";
    return byName.get(key) ?? null;
  };
}

/** Keeps only grounded, well-formed items: people must be members of this circle, lists are capped. */
export function sanitizePlan(raw: PlanOutput, members: MemberInfo[], basedOn: number): GroupPlan {
  const who = memberMatcher(members);
  return {
    title: clean(raw.title) || "Our plan",
    when: clean(raw.when),
    where: clean(raw.where),
    what: clean(raw.what),
    bring: raw.bring
      .map((b) => ({ who: who(b.who), item: clean(b.item) }))
      .filter((b): b is { who: string; item: string } => b.who !== null && b.item.length > 0)
      .slice(0, MAX_ITEMS),
    comfort: raw.comfort
      .map((c) => ({ who: who(c.who), need: clean(c.need), how: clean(c.how) }))
      .filter((c): c is GroupPlan["comfort"][number] => c.who !== null && c.need.length > 0 && c.how.length > 0)
      .slice(0, MAX_ITEMS),
    openQuestions: raw.open_questions
      .map((q) => ({ question: clean(q.question), ask: who(q.ask, true) ?? "everyone" }))
      .filter((q) => q.question.length > 0)
      .slice(0, MAX_QUESTIONS),
    suggestions: raw.suggestions.map(clean).filter(Boolean).slice(0, MAX_SUGGESTIONS),
    basedOn,
  };
}

/** The plan as one plain message, laid out the same way every time so it's easy to scan. */
export function formatPlan(plan: GroupPlan): string {
  const lines = [`📋 Plan: ${plan.title}`];
  if (plan.when) lines.push(`When: ${plan.when}`);
  if (plan.where) lines.push(`Where: ${plan.where}`);
  if (plan.what) lines.push(`What: ${plan.what}`);
  if (plan.bring.length) lines.push(`Bringing: ${plan.bring.map((b) => `${b.who} – ${b.item}`).join("; ")}`);
  if (plan.comfort.length) lines.push("So it works for everyone:", ...plan.comfort.map((c) => `• ${c.how} (${c.who})`));
  if (plan.openQuestions.length) {
    lines.push("Still to decide:", ...plan.openQuestions.map((q) => `• ${q.ask === "everyone" ? "" : `${q.ask}: `}${q.question}`));
  }
  return lines.join("\n").slice(0, MAX_MESSAGE_CHARS);
}

function memberContext(members: MemberInfo[]) {
  return members.map((m) => ({
    name: firstName(m.displayName),
    status: statusInfo(m.status).id === "none" ? "" : statusInfo(m.status).label,
    how_to_talk_with_me: m.commCard ? [...m.commCard.chips, m.commCard.note].filter(Boolean) : [],
  }));
}

/**
 * Reads the circle's recent conversation (as this member sees it) and everyone's shared cards, and drafts
 * one plan. Nothing is posted: the organiser reviews and approves the exact text like any AI-assisted message.
 */
export async function draftPlan(userId: string, circleId: string, goal: string, creds: GeminiCredentials): Promise<PlanResult> {
  const circle = await getCircle(userId, circleId);
  await assertCanSendDirect(db(), userId, circleId);
  await rateLimit(`plan:${userId}`, PLAN_LIMIT_PER_HOUR, 3600);
  const page = await listMessages(userId, circleId, null);
  const recent = page.messages
    .filter((m) => !m.deleted && m.text)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((m) => ({ from: firstName(m.senderName), text: m.text as string }));
  const started = Date.now();
  const { data, model } = await generateJson(
    creds,
    {
      system: PLAN_SYSTEM,
      parts: [{ text: JSON.stringify({ goal: goal.trim().slice(0, MAX_GOAL_CHARS), members: memberContext(circle.members), messages: recent }) }],
    },
    planOutput,
  );
  void recordEvent("plan", { ms: Date.now() - started, model, messages: recent.length });
  const plan = sanitizePlan(data, circle.members, recent.length);
  const draft = await createDraft(userId, {
    circleId,
    replyToId: null,
    sourceMode: "type",
    sourceText: goal.trim() || "Plan from our conversation",
    aiText: formatPlan(plan),
  });
  return { plan, draft };
}
