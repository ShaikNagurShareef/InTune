import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { aiCredentials } from "@/lib/gemini/access";
import { draftPlan } from "@/lib/services/plan";

export const maxDuration = 60;

const body = z.strictObject({ goal: z.string().trim().max(300).default("") });

/** "Plan it together": drafts a plan from the circle's recent chat. Posting it still needs approval. */
export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const { goal } = await parseJson(req, body);
  const creds = await aiCredentials(req, user.id);
  return json(await draftPlan(user.id, await idParam(ctx, "id"), goal, creds));
});
