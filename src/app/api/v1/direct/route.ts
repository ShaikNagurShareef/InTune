import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/rate-limit";
import { openDirect } from "@/lib/services/direct";
import { uuid } from "@/lib/validation";

/** Opens the existing direct chat with someone, or starts it. */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { user_id } = await parseJson(req, z.strictObject({ user_id: uuid }));
  await rateLimit(`direct:${user.id}`, 60, 3600);
  return json(await openDirect(user.id, user_id), 201);
});
