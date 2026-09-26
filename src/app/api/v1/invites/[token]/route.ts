import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import type { Ctx } from "@/lib/api";
import { previewInvite } from "@/lib/services/invites";

export const GET = route<Ctx<{ token: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const { token } = await ctx.params;
  return json(await previewInvite(token.slice(0, 100), user));
});
