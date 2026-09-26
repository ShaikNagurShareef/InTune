import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { credentialsFromRequest } from "@/lib/gemini/client";
import { simplifyForReader } from "@/lib/services/reading-aid";

export const maxDuration = 60;

export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const creds = credentialsFromRequest(req);
  return json(await simplifyForReader(user.id, await idParam(ctx, "id"), creds));
});
