import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { deleteDraft, getOwnedDraft, updateDraft } from "@/lib/services/drafts";
import { getOwnedMedia } from "@/lib/services/media";
import { draftText, sourceMode, uuid } from "@/lib/validation";

type P = Ctx<{ id: string }>;

// Unknown fields (e.g. "status" or "approved") are rejected: state is never client-controlled.
const patch = z.strictObject({
  expected_version: z.number().int().positive(),
  text: draftText.optional(),
  source_text: draftText.optional(),
  source_mode: sourceMode.optional(),
  media_id: uuid.nullable().optional(),
  transcript: draftText.nullable().optional(),
  use_original: z.boolean().optional(),
});

export const GET = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  return json(await getOwnedDraft(user.id, await idParam(ctx, "id")));
});

export const PATCH = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  const input = await parseJson(req, patch);
  if (input.media_id) await getOwnedMedia(user.id, input.media_id);
  const draft = await updateDraft(user.id, await idParam(ctx, "id"), {
    expectedVersion: input.expected_version,
    text: input.text,
    sourceText: input.source_text,
    sourceMode: input.source_mode,
    mediaId: input.media_id,
    transcript: input.transcript,
    useOriginal: input.use_original,
  });
  return json(draft);
});

export const DELETE = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  await deleteDraft(user.id, await idParam(ctx, "id"));
  return json({ ok: true });
});
