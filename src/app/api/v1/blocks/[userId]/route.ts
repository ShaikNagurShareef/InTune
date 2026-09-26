import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { unblockUser } from "@/lib/services/moderation";

export const DELETE = route<Ctx<{ userId: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  await unblockUser(user.id, await idParam(ctx, "userId"));
  return json({ ok: true });
});
