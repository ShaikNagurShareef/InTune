import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { createInvite, inviteByEmail, listPendingInvites } from "@/lib/services/invites";
import { email } from "@/lib/validation";

type P = Ctx<{ id: string }>;

export const GET = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  return json({ invites: await listPendingInvites(user.id, await idParam(ctx, "id")) });
});

const body = z.union([
  z.strictObject({ target_email: email }),
  z.strictObject({ share_link: z.literal(true) }),
]);

/**
 * In-app invitation by exact email (the default), or a one-time share link for someone who hasn't
 * joined InTune yet. The email path always answers the same way, whether or not the account exists.
 */
export const POST = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  const input = await parseJson(req, body);
  const circleId = await idParam(ctx, "id");
  await rateLimit(`invite:${user.id}`, 30, 3600);
  if ("target_email" in input) {
    await inviteByEmail(user.id, circleId, input.target_email);
    return json({ sent: true }, 201);
  }
  const invite = await createInvite(user.id, circleId, null);
  const url = new URL(`/invite/${invite.token}`, req.url).toString();
  return json({ id: invite.id, url, expiresAt: invite.expiresAt }, 201);
});
