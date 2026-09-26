import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { setStatus } from "@/lib/services/accounts";
import { status } from "@/lib/social";

/** Energy status you choose; shown only to people who share a circle with you. */
export const PUT = route(async (req) => {
  const user = await requireUser(req);
  const input = await parseJson(req, z.strictObject({ status }));
  await setStatus(user.id, input.status);
  return json({ status: input.status });
});
