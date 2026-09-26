import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { credentialsFromRequest } from "@/lib/gemini/client";
import { startAssist } from "@/lib/services/assist";
import { wordingMode } from "@/lib/validation";

export const maxDuration = 60;

const body = z.strictObject({ expected_version: z.number().int().positive(), wording_mode: wordingMode });

export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const creds = credentialsFromRequest(req);
  const input = await parseJson(req, body);
  const job = await startAssist(
    user.id,
    await idParam(ctx, "id"),
    { expectedVersion: input.expected_version, wordingMode: input.wording_mode },
    creds,
    req.signal,
  );
  return json(job, 201);
});
