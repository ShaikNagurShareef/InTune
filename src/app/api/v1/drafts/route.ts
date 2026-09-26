import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { createDraft } from "@/lib/services/drafts";
import { draftText, sourceMode, uuid } from "@/lib/validation";
import { toneTags } from "@/lib/social";

const body = z.strictObject({
  circle_id: uuid,
  reply_to_id: uuid.nullable(),
  source_mode: sourceMode,
  source_text: draftText,
  tone_tags: toneTags.default([]),
});

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const input = await parseJson(req, body);
  const draft = await createDraft(user.id, {
    circleId: input.circle_id,
    replyToId: input.reply_to_id,
    sourceMode: input.source_mode,
    sourceText: input.source_text,
    toneTags: input.tone_tags,
  });
  return json(draft, 201);
});
