import { z } from "zod";

/**
 * Explicit social signals, always chosen by the person, never inferred by a model.
 * Tone tags follow the tone-indicator practice (/j, /srs) many autistic people already use online.
 */
export const TONE_TAGS = [
  { id: "joking", label: "Joking", icon: "😄" },
  { id: "serious", label: "Serious", icon: "🎯" },
  { id: "not_upset", label: "Not upset", icon: "🙂" },
  { id: "just_asking", label: "Just asking", icon: "❔" },
  { id: "no_rush", label: "No rush", icon: "🐢" },
  { id: "no_reply_needed", label: "No reply needed", icon: "🤝" },
] as const;
export type ToneTagId = (typeof TONE_TAGS)[number]["id"];
export const MAX_TONE_TAGS = 3;
export const toneTags = z
  .array(z.enum(TONE_TAGS.map((t) => t.id) as [ToneTagId, ...ToneTagId[]]))
  .max(MAX_TONE_TAGS)
  .transform((tags) => [...new Set(tags)]);

export const STATUSES = [
  { id: "none", label: "No status", short: "", icon: "" },
  { id: "slow_replies", label: "Replies may be slow", short: "Slow replies", icon: "🐢" },
  { id: "low_energy", label: "Low energy today", short: "Low energy", icon: "🔋" },
  { id: "taking_break", label: "Taking a break", short: "On a break", icon: "🌙" },
] as const;
export type StatusId = (typeof STATUSES)[number]["id"];
export const status = z.enum(STATUSES.map((s) => s.id) as [StatusId, ...StatusId[]]);

export const CARD_CHIPS = [
  "I prefer text",
  "Ask me direct questions",
  "Please say what you mean literally",
  "One question at a time",
  "Give me time to reply",
  "I may not reply right away — that's OK",
  "Please avoid sarcasm",
  "No surprise calls",
] as const;
export const commCard = z.strictObject({
  chips: z.array(z.enum(CARD_CHIPS)).max(CARD_CHIPS.length),
  note: z.string().trim().max(280),
});
export type CommCard = z.infer<typeof commCard>;

export const statusInfo = (id: string) => STATUSES.find((s) => s.id === id) ?? STATUSES[0];
export const toneInfo = (id: string) => TONE_TAGS.find((t) => t.id === id);
