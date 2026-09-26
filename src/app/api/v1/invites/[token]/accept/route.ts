import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import type { Ctx } from "@/lib/api";
import { acceptInvite } from "@/lib/services/invites";

export const POST = route<Ctx<{ token: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const { token } = await ctx.params;
  return json(await acceptInvite(token.slice(0, 100), user));
});
