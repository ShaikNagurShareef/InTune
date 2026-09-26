import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { callToken } from "@/lib/services/calls";

/** Short-lived LiveKit join token for current members only. */
export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  return json(await callToken(user, await idParam(ctx, "id")));
});
