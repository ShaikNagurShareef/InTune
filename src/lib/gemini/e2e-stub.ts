import type { GeminiTransport } from "./client";
import { CHECK_SYSTEM, COMPOSE_SYSTEM, LIVE_INTERPRET_SYSTEM, LIVE_SAY_SYSTEM, PLAN_SYSTEM, SIMPLIFY_SYSTEM } from "./prompts";

/**
 * Deterministic stand-in for Gemini used only by Playwright tests (INTUNE_E2E_GEMINI_STUB=1 outside production).
 * It is never used for demos: scripted output must not be presented as live generation (spec §15).
 */
export function e2eStubEnabled(): boolean {
  return process.env.INTUNE_E2E_GEMINI_STUB === "1" && process.env.NODE_ENV !== "production";
}

export const e2eStubTransport: GeminiTransport = {
  async generate(_creds, req) {
    const input = req.parts.map((p) => p.text ?? "").join("\n");
    if (req.system === SIMPLIFY_SYSTEM) {
      return JSON.stringify({
        simplified_text: "Do you want to come to dinner on Friday? It is loud inside. Can we sit outside?",
        kept_details: ["Friday"],
        asking: "Will you come to dinner on Friday, and is sitting outside OK?",
        reply_expected: "yes",
        unclear: "",
      });
    }
    if (req.system === PLAN_SYSTEM) {
      const members = (JSON.parse(input) as { members: { name: string }[] }).members.map((m) => m.name);
      return JSON.stringify({
        title: "Sunday picnic",
        when: "Sunday",
        where: "",
        what: "Picnic and a quiet card game",
        bring: [{ who: members[0], item: "snacks" }],
        comfort: [{ who: members[1] ?? members[0], need: "a quiet place", how: "We meet outdoors, away from loud cafés" }],
        open_questions: [{ question: "Can we meet from 10:00 am to 12:00 pm?", ask: "everyone" }],
        suggestions: ["A morning start, when it is less busy"],
      });
    }
    if (req.system === LIVE_INTERPRET_SYSTEM) {
      return JSON.stringify({ plain: "Can we meet at 3 on Friday?", asking: "Can you meet at 3 on Friday?", reply_expected: "yes", unclear: "" });
    }
    if (req.system === LIVE_SAY_SYSTEM) {
      return JSON.stringify({ text: "I need a short break. I will be back in five minutes.", added_meaning: [] });
    }
    if (req.system === CHECK_SYSTEM) {
      return JSON.stringify({ meaning_preserved: true, unsupported_additions: [], lost_meaning: [], needs_clarification: false, question: "", choices: [] });
    }
    if (req.system === COMPOSE_SYSTEM) {
      const answered = input.includes('"answer:1"');
      const ask = !answered && input.includes("loud");
      return JSON.stringify({
        draft_text: ask ? "Do you want to come to dinner? It's loud, so can we sit [where?]" : "Do you want to come to dinner on Friday? It's loud inside, so can we sit outside?",
        evidence_ids: ["source"],
        uncertain_spans: [],
        unresolved_fields: ask ? [{ field: "place", reason: "not said" }] : [],
        clarification_question: ask ? "Where would you like to sit?" : "",
        choices: ask ? ["Outside", "Inside"] : [],
        unsupported_additions: [],
        used_phrase_ids: [],
      });
    }
    return JSON.stringify({ transcript: "want come dinner friday loud outside", uncertain_spans: [], no_speech: false, multiple_speakers: false, language: "en" });
  },
};
