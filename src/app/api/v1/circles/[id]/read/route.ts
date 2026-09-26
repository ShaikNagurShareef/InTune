import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { markRead } from "@/lib/services/circles";

export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  await markRead(user.id, await idParam(ctx, "id"));
  return json({ ok: true });
});
