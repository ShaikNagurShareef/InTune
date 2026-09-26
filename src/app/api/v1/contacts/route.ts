import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { listContacts } from "@/lib/services/direct";

/** People you share a circle with: the only people you can start a direct chat with. */
export const GET = route(async (req) => json({ contacts: await listContacts((await requireUser(req)).id) }));
