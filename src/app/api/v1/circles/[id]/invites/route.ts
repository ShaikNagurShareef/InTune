import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { createInvite, listPendingInvites } from "@/lib/services/invites";
import { email } from "@/lib/validation";

type P = Ctx<{ id: string }>;

export const GET = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  return json({ invites: await listPendingInvites(user.id, await idParam(ctx, "id")) });
});

/** The raw token is returned exactly once; only its hash is stored. */
export const POST = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  const { target_email } = await parseJson(req, z.strictObject({ target_email: email.nullable() }));
  await rateLimit(`invite:${user.id}`, 30, 3600);
  const invite = await createInvite(user.id, await idParam(ctx, "id"), target_email);
  const url = new URL(`/invite/${invite.token}`, req.url).toString();
  return json({ id: invite.id, url, expiresAt: invite.expiresAt }, 201);
});
