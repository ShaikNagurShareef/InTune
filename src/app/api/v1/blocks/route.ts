import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { blockUser, listBlocked } from "@/lib/services/moderation";
import { uuid } from "@/lib/validation";

export const GET = route(async (req) => json({ blocked: await listBlocked((await requireUser(req)).id) }));

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { user_id } = await parseJson(req, z.strictObject({ user_id: uuid }));
  await blockUser(user.id, user_id);
  return json({ ok: true }, 201);
});
