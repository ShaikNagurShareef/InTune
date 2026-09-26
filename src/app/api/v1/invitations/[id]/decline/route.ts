import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { declineInvitation } from "@/lib/services/invites";

export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  await declineInvitation(await idParam(ctx, "id"), user);
  return json({ ok: true });
});
