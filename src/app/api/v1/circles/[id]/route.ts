import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { deleteCircle, getCircle } from "@/lib/services/circles";

type P = Ctx<{ id: string }>;

export const GET = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  return json(await getCircle(user.id, await idParam(ctx, "id")));
});

export const DELETE = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  await deleteCircle(user.id, await idParam(ctx, "id"));
  return json({ ok: true });
});
