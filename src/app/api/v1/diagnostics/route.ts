import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { diagnosticsSummary } from "@/lib/services/diagnostics";

export const GET = route(async (req) => {
  await requireUser(req);
  return json(await diagnosticsSummary());
});
