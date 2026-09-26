import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { getPreferences } from "@/lib/services/accounts";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  return json({ user, preferences: await getPreferences(user.id) });
});
