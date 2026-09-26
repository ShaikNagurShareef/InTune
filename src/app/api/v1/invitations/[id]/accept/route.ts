import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { acceptInvitation } from "@/lib/services/invites";

export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  return json(await acceptInvitation(await idParam(ctx, "id"), user));
});
