import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { resetPreferences } from "@/lib/services/accounts";

export const POST = route(async (req) => json(await resetPreferences((await requireUser(req)).id)));
