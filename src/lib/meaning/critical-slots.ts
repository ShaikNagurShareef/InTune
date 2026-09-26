/**
 * Deterministic critical-slot extraction (spec §13 "critical-slot accuracy"): negation, numbers,
 * dates/times, conditions and names. It complements the model's own meaning check and never relies on it.
 */

export type SlotKind = "negation" | "number" | "time" | "condition" | "name";

export interface Slot {
  kind: SlotKind;
  value: string;
}

export interface SlotDiff {
  lost: Slot[];
  added: Slot[];
}

const NEGATION = /\b(no|not|never|none|nobody|nothing|nowhere|neither|nor|without|cannot|can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|shouldn't|wouldn't|couldn't|haven't|hasn't|hadn't|refuse|refused)\b|n't\b/gi;

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8",
  nine: "9", ten: "10", eleven: "11", twelve: "12", fifteen: "15", twenty: "20", thirty: "30",
  half: "0.5", dozen: "12", hundred: "100",
};
const NUMBER = new RegExp(`\\b(\\d+(?:[.,:]\\d+)?|${Object.keys(NUMBER_WORDS).join("|")})\\b`, "gi");

const TIME_WORDS =
  "today|tonight|tomorrow|yesterday|morning|afternoon|evening|noon|midnight|weekend|" +
  "monday|tuesday|wednesday|thursday|friday|saturday|sunday|" +
  "january|february|march|april|june|july|august|september|october|november|december|" +
  "am|pm|o'clock|next week|last week|this week";
const TIME = new RegExp(`\\b(${TIME_WORDS})\\b`, "gi");

const CONDITION = /\b(if|unless|only if|as long as|provided|in case|otherwise)\b/gi;

const PRONOUNS = new Set(["i'm", "i'll", "i've", "i'd", "ok", "okay"]);

/** Capitalised words not at the start of a sentence, excluding pronoun "I" and time words. */
function extractNames(text: string): string[] {
  const names: string[] = [];
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).slice(1);
    for (const raw of words) {
      const word = raw.replace(/[^\p{L}'-]/gu, "");
      const lower = word.toLowerCase();
      if (word.length > 1 && /^\p{Lu}/u.test(word) && !TIME.test(word) && !PRONOUNS.has(lower)) names.push(lower);
      TIME.lastIndex = 0;
    }
  }
  return names;
}

function matches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((m) => m[0].toLowerCase());
}

/** "seven", "7" and "7:00" are the same number; "7:30" stays distinct. */
const normalizeNumber = (n: string): string => NUMBER_WORDS[n.toLowerCase()] ?? n.replace(",", ".").replace(/^(\d{1,2})[:.]00$/, "$1");

export function extractSlots(text: string): Slot[] {
  const slots: Slot[] = [];
  if (matches(text, NEGATION).length) slots.push({ kind: "negation", value: "negation" });
  for (const n of new Set(matches(text, NUMBER).map(normalizeNumber))) slots.push({ kind: "number", value: n });
  for (const t of new Set(matches(text, TIME))) slots.push({ kind: "time", value: t });
  if (matches(text, CONDITION).length) slots.push({ kind: "condition", value: "condition" });
  for (const n of new Set(extractNames(text))) slots.push({ kind: "name", value: n });
  return slots;
}

const key = (s: Slot) => `${s.kind}:${s.value}`;

/** Slots present in the source but missing from the draft are "lost"; the reverse are "added". */
export function diffSlots(source: string, draft: string): SlotDiff {
  const src = extractSlots(source);
  const dst = extractSlots(draft);
  const srcKeys = new Set(src.map(key));
  const dstKeys = new Set(dst.map(key));
  // Names are only compared case-insensitively against the other text, to tolerate re-capitalisation.
  const lowerDraft = draft.toLowerCase();
  const lowerSource = source.toLowerCase();
  return {
    lost: src.filter((s) => !dstKeys.has(key(s)) && !(s.kind === "name" && lowerDraft.includes(s.value))),
    added: dst.filter((s) => !srcKeys.has(key(s)) && !(s.kind === "name" && lowerSource.includes(s.value))),
  };
}

export function describeSlot(s: Slot): string {
  switch (s.kind) {
    case "negation":
      return "a “no / not”";
    case "condition":
      return "a condition (if / unless)";
    default:
      return `“${s.value}”`;
  }
}
