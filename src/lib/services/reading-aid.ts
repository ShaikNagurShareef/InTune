import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { readingAids } from "@/lib/db/schema";
import { notFound } from "@/lib/errors";
import { generateJson, type GeminiCredentials } from "@/lib/gemini/client";
import { SIMPLIFY_SYSTEM, simplifyOutput } from "@/lib/gemini/prompts";
import { describeSlot, diffSlots } from "@/lib/meaning/critical-slots";
import { recordEvent } from "@/lib/metrics";
import { rateLimit } from "@/lib/rate-limit";
import { getMessageForMember } from "./messages";

const SIMPLIFY_LIMIT_PER_HOUR = 120;

export interface AidSummary {
  asking: string;
  replyExpected: "yes" | "no" | "unclear";
  unclear: string;
}

export interface ReadingAid {
  messageId: string;
  messageVersion: number;
  simplifiedText: string;
  warnings: string[];
  summary: AidSummary | null;
  modelId: string;
}

/**
 * Recipient-private "Make clearer" (FR24). Cached per recipient and message version; the sender's message
 * is never changed. If critical details would be lost, the aid carries warnings and the original stays primary.
 */
export async function simplifyForReader(
  userId: string,
  messageId: string,
  creds: GeminiCredentials,
): Promise<ReadingAid> {
  const message = await getMessageForMember(userId, messageId);
  if (message.deletedAt) throw notFound();
  const [cached] = await db()
    .select()
    .from(readingAids)
    .where(
      and(
        eq(readingAids.messageId, messageId),
        eq(readingAids.userId, userId),
        eq(readingAids.messageVersion, message.version),
      ),
    );
  if (cached) {
    return {
      messageId,
      messageVersion: cached.messageVersion,
      simplifiedText: cached.simplifiedText,
      warnings: (cached.warnings as string[] | null) ?? [],
      summary: (cached.summary as AidSummary | null) ?? null,
      modelId: cached.modelId,
    };
  }
  await rateLimit(`simplify:${userId}`, SIMPLIFY_LIMIT_PER_HOUR, 3600);
  const started = Date.now();
  const { data } = await generateJson(
    creds,
    { system: SIMPLIFY_SYSTEM, parts: [{ text: JSON.stringify({ message: message.text }) }] },
    simplifyOutput,
  );
  const lost = diffSlots(message.text, data.simplified_text).lost;
  const warnings = lost.map((l) => `The original also mentions ${describeSlot(l)}. Check the original.`);
  // Sender-chosen tags outrank the model's reading of whether a reply is needed.
  const noReplyTag = message.toneTags.includes("no_reply_needed");
  const summary: AidSummary = {
    asking: data.asking.trim().slice(0, 300),
    replyExpected: noReplyTag ? "no" : data.reply_expected,
    unclear: data.unclear.trim().slice(0, 300),
  };
  const aid = {
    messageId,
    userId,
    messageVersion: message.version,
    simplifiedText: data.simplified_text.trim(),
    warnings,
    summary,
    modelId: creds.model,
  };
  await db().insert(readingAids).values(aid).onConflictDoNothing();
  void recordEvent("simplify", { ms: Date.now() - started, warnings: warnings.length, model: creds.model });
  return {
    messageId,
    messageVersion: aid.messageVersion,
    simplifiedText: aid.simplifiedText,
    warnings,
    summary,
    modelId: aid.modelId,
  };
}
