import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { revokeInvite } from "@/lib/services/invites";

export const DELETE = route<Ctx<{ id: string; inviteId: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  await revokeInvite(user.id, await idParam(ctx, "id"), await idParam(ctx, "inviteId"));
  return json({ ok: true });
});
