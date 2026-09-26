import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { deleteDraftsAndRecordings } from "@/lib/services/retention";

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await deleteDraftsAndRecordings(user.id);
  return json({ ok: true });
});
