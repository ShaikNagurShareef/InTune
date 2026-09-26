import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { getJob } from "@/lib/services/assist";

export const GET = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  return json(await getJob(user.id, await idParam(ctx, "id")));
});
