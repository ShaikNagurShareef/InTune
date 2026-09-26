import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { createCircle, listCircles } from "@/lib/services/circles";
import { circleName } from "@/lib/validation";

export const GET = route(async (req) => json({ circles: await listCircles((await requireUser(req)).id) }));

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const { name } = await parseJson(req, z.strictObject({ name: circleName }));
  return json(await createCircle(user.id, name), 201);
});
