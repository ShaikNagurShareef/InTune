import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { aiCredentials } from "@/lib/gemini/access";
import { suggestSay } from "@/lib/services/interpreter";

export const maxDuration = 30;

/** "Say it for me": suggests a clear sentence from typed shorthand; the person approves before it is spoken. */
export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const { note } = await parseJson(req, z.strictObject({ note: z.string().trim().min(1).max(500) }));
  const creds = await aiCredentials(req, user.id);
  return json(await suggestSay(user.id, await idParam(ctx, "id"), note, creds));
});
