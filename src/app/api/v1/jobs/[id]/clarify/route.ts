import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { credentialsFromRequest } from "@/lib/gemini/client";
import { resumeAssist } from "@/lib/services/assist";
import { draftText, wordingMode } from "@/lib/validation";

export const maxDuration = 60;

const body = z.strictObject({
  answer: z.string().max(300).optional(),
  transcript: draftText.optional(),
  wording_mode: wordingMode.optional(),
});

export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const creds = credentialsFromRequest(req);
  const input = await parseJson(req, body);
  const job = await resumeAssist(
    user.id,
    await idParam(ctx, "id"),
    { answer: input.answer, transcript: input.transcript, wordingMode: input.wording_mode },
    creds,
    req.signal,
  );
  return json(job);
});
