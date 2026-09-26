import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { getPreferences, updatePreferences } from "@/lib/services/accounts";
import { preferencesInput } from "@/lib/validation";

export const GET = route(async (req) => json(await getPreferences((await requireUser(req)).id)));

export const PUT = route(async (req) => {
  const user = await requireUser(req);
  return json(await updatePreferences(user.id, await parseJson(req, preferencesInput)));
});
