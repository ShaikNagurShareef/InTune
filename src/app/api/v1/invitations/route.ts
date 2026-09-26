import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { listMyInvitations } from "@/lib/services/invites";

/** Invitations addressed to the signed-in account. */
export const GET = route(async (req) => json({ invitations: await listMyInvitations(await requireUser(req)) }));
