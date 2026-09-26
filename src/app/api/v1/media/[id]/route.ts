import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { deleteOwnedMedia } from "@/lib/services/media";

export const DELETE = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  await deleteOwnedMedia(user.id, await idParam(ctx, "id"));
  return json({ ok: true });
});
