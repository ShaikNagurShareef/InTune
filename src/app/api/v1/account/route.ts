import { route } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { sessionCookieHeader } from "@/lib/auth/session";
import { deleteAccount } from "@/lib/services/retention";
import { AppError } from "@/lib/errors";
import { isDemoEmail } from "@/lib/demo";

export const DELETE = route(async (req) => {
  const user = await requireUser(req);
  if (isDemoEmail(user.email)) throw new AppError("forbidden", "Demo accounts can't be deleted. Create your own account to try this.");
  await deleteAccount(user.id);
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookieHeader(null) } });
});
