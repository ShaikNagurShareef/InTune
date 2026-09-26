import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { aiCredentials } from "@/lib/gemini/access";
import { interpretUtterance, MAX_UTTERANCE_CHARS } from "@/lib/services/interpreter";

export const maxDuration = 30;

const body = z.strictObject({
  utterance: z.string().trim().min(1).max(MAX_UTTERANCE_CHARS),
  speaker: z.string().trim().min(1).max(80),
});

/** Live interpreter for one caption line. Nothing is stored. */
export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const input = await parseJson(req, body);
  const creds = await aiCredentials(req, user.id);
  return json(await interpretUtterance(user.id, await idParam(ctx, "id"), input.utterance, input.speaker, creds));
});
