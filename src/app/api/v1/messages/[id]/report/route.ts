import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { reportMessage } from "@/lib/services/moderation";

const body = z.strictObject({ reason: z.string().trim().min(1).max(500), include_text: z.boolean() });

export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const input = await parseJson(req, body);
  await rateLimit(`report:${user.id}`, 30, 3600);
  return json(await reportMessage(user.id, await idParam(ctx, "id"), input.reason, input.include_text), 201);
});
