import { z } from "zod";

export const MAX_MESSAGE_CHARS = 2000;

/** 1–2000 characters, whitespace-only rejected, line breaks kept (FR11). */
export const messageText = z
  .string()
  .max(MAX_MESSAGE_CHARS, "Messages can be up to 2000 characters.")
  .refine((s) => s.trim().length > 0, "Message cannot be empty.");

export const draftText = z.string().max(MAX_MESSAGE_CHARS);

export const uuid = z.uuid();
export const email = z.email().max(254).transform((s) => s.trim().toLowerCase());
export const displayName = z.string().trim().min(1).max(60);
export const password = z.string().min(8, "Use at least 8 characters.").max(200);
export const circleName = z.string().trim().min(1).max(80);

export const sourceMode = z.enum(["type", "symbols", "speak", "video"]);
export type SourceMode = z.infer<typeof sourceMode>;

export const wordingMode = z.enum(["keep", "clearer", "shorter"]);
export type WordingMode = z.infer<typeof wordingMode>;

export const idempotencyKey = z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/);

export const preferencesInput = z.strictObject({
  expected_version: z.number().int().positive(),
  inputMode: sourceMode,
  textSize: z.enum(["md", "lg", "xl"]),
  sentenceLength: z.enum(["short", "medium", "long"]),
  audioRate: z.number().min(0.5).max(2),
  reduceMotion: z.boolean(),
  quietMode: z.boolean(),
  locale: z.enum(["en"]),
});
export type PreferencesInput = z.infer<typeof preferencesInput>;
