import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { getActiveCall, startCall } from "@/lib/services/calls";

type P = Ctx<{ id: string }>;

/** The call in progress in this circle, if any (with who is in it). */
export const GET = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  return json({ call: await getActiveCall(user.id, await idParam(ctx, "id")) });
});

/** Start a call, or join the one already running. */
export const POST = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  const { kind } = await parseJson(req, z.strictObject({ kind: z.enum(["audio", "video"]) }));
  await rateLimit(`call:${user.id}`, 60, 3600);
  return json({ call: await startCall(user.id, await idParam(ctx, "id"), kind) }, 201);
});
