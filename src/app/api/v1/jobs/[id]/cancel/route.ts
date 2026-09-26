import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { cancelJob } from "@/lib/services/assist";

export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  return json(await cancelJob(user.id, await idParam(ctx, "id")));
});
