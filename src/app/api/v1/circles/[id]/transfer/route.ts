import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { transferOwnership } from "@/lib/services/circles";
import { uuid } from "@/lib/validation";

export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const { user_id } = await parseJson(req, z.strictObject({ user_id: uuid }));
  await transferOwnership(user.id, await idParam(ctx, "id"), user_id);
  return json({ ok: true });
});
