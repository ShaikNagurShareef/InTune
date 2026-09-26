import { generateJson, type GeminiCredentials } from "@/lib/gemini/client";
import { LIVE_INTERPRET_SYSTEM, LIVE_SAY_SYSTEM, liveInterpretOutput, liveSayOutput } from "@/lib/gemini/prompts";
import { describeSlot, diffSlots } from "@/lib/meaning/critical-slots";
import { recordEvent } from "@/lib/metrics";
import { rateLimit } from "@/lib/rate-limit";
import { liveCallCircleId } from "./calls";

const INTERPRET_LIMIT_PER_HOUR = 300;
const SAY_LIMIT_PER_HOUR = 120;
export const MAX_UTTERANCE_CHARS = 600;

export interface Interpretation {
  plain: string;
  asking: string;
  replyExpected: "yes" | "no" | "unclear";
  unclear: string;
  warnings: string[];
}

/**
 * Live interpreter for one spoken line (from captions). Ephemeral: nothing is stored, and only
 * content-free timings are logged. Caller must be a member of the call's circle.
 */
export async function interpretUtterance(
  userId: string,
  callId: string,
  utterance: string,
  speaker: string,
  creds: GeminiCredentials,
): Promise<Interpretation> {
  await liveCallCircleId(userId, callId);
  await rateLimit(`interpret:${userId}`, INTERPRET_LIMIT_PER_HOUR, 3600);
  const started = Date.now();
  const { data, model } = await generateJson(
    creds,
    { system: LIVE_INTERPRET_SYSTEM, parts: [{ text: JSON.stringify({ speaker, utterance }) }] },
    liveInterpretOutput,
  );
  const lost = diffSlots(utterance, data.plain).lost;
  void recordEvent("simplify", { ms: Date.now() - started, live: true, model });
  return {
    plain: data.plain.trim(),
    asking: data.asking.trim(),
    replyExpected: data.reply_expected,
    unclear: data.unclear.trim(),
    warnings: lost.map((l) => `They also said ${describeSlot(l)}.`),
  };
}

export interface SaySuggestion {
  text: string;
  flags: string[];
}

/** Turns typed shorthand into a clear first-person sentence. The person approves before it is spoken. */
export async function suggestSay(userId: string, callId: string, note: string, creds: GeminiCredentials): Promise<SaySuggestion> {
  await liveCallCircleId(userId, callId);
  await rateLimit(`say:${userId}`, SAY_LIMIT_PER_HOUR, 3600);
  const { data } = await generateJson(creds, { system: LIVE_SAY_SYSTEM, parts: [{ text: JSON.stringify({ note }) }] }, liveSayOutput);
  const slots = diffSlots(note, data.text);
  return {
    text: data.text.trim(),
    flags: [...data.added_meaning, ...slots.lost.map((l) => `Missing ${describeSlot(l)}`)].filter((f) => f.trim().length > 3),
  };
}
