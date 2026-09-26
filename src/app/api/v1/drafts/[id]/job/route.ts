import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { latestJobForDraft } from "@/lib/services/assist";

/** Latest job for a draft, so the composer can show stage labels and offer Cancel while it runs (FR27). */
export const GET = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  return json(await latestJobForDraft(user.id, await idParam(ctx, "id")));
});
