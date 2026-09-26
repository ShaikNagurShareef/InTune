import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { listMessages } from "@/lib/services/messages";

export const GET = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const before = new URL(req.url).searchParams.get("before");
  return json(await listMessages(user.id, await idParam(ctx, "id"), before));
});
