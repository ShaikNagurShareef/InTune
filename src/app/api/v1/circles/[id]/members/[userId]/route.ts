import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { removeMember } from "@/lib/services/circles";

export const DELETE = route<Ctx<{ id: string; userId: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  await removeMember(user.id, await idParam(ctx, "id"), await idParam(ctx, "userId"));
  return json({ ok: true });
});
