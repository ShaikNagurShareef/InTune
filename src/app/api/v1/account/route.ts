import { route } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { sessionCookieHeader } from "@/lib/auth/session";
import { deleteAccount } from "@/lib/services/retention";

export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  await deleteAccount(user.id);
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookieHeader(null) } });
});
