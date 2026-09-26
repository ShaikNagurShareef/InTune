import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { resolveReport } from "@/lib/services/moderation";

export const POST = route<Ctx<{ reportId: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const { action } = await parseJson(req, z.strictObject({ action: z.enum(["dismiss", "remove"]) }));
  await resolveReport(user.id, await idParam(ctx, "reportId"), action);
  return json({ ok: true });
});
