import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { canViewDiagnostics, diagnosticsSummary } from "@/lib/services/diagnostics";
import { notFound } from "@/lib/errors";

export const GET = route(async (req) => {
  const user = await requireUser(req);
  if (!canViewDiagnostics(user.email)) throw notFound();
  return json(await diagnosticsSummary());
});
