import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { AppError } from "@/lib/errors";
import { recordEvent } from "@/lib/metrics";
import { rateLimit } from "@/lib/rate-limit";
import { publishMessage } from "@/lib/services/publish";
import { idempotencyKey, messageText, uuid } from "@/lib/validation";
import { toneTags } from "@/lib/social";

const body = z.strictObject({
  circle_id: uuid,
  text: messageText,
  reply_to_id: uuid.nullable(),
  draft_id: uuid.nullable(),
  approval_id: uuid.nullable(),
  tone_tags: toneTags.default([]),
});

/** Publishes only on an explicit Send. Retries with the same Idempotency-Key return the same message ID (FR22). */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const key = idempotencyKey.safeParse(req.headers.get("idempotency-key"));
  if (!key.success) throw new AppError("invalid_input", "Missing Idempotency-Key header.");
  const input = await parseJson(req, body);
  await rateLimit(`send:${user.id}`, 120, 3600);
  const result = await publishMessage(user.id, {
    circleId: input.circle_id,
    text: input.text,
    replyToId: input.reply_to_id,
    draftId: input.draft_id,
    approvalId: input.approval_id,
    toneTags: input.tone_tags,
    idempotencyKey: key.data,
  });
  void recordEvent("send", { replayed: result.replayed, assisted: input.approval_id !== null }, user.id);
  return json({ message_id: result.messageId, replayed: result.replayed }, result.replayed ? 200 : 201);
});
