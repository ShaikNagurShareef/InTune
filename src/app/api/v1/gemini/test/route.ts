import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { credentialsFromRequest, listModels } from "@/lib/gemini/client";
import { PREFERRED_MODELS } from "@/lib/gemini/config";
import { rateLimit } from "@/lib/rate-limit";

/** Checks a BYOK key by listing models. The key is used for this call only and is not stored. */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  await rateLimit(`keytest:${user.id}`, 20, 3600);
  const { apiKey } = credentialsFromRequest(req);
  const models = await listModels(apiKey);
  const recommended = PREFERRED_MODELS.find((m) => models.includes(m)) ?? models.find((m) => m.includes("flash")) ?? models[0] ?? null;
  return json({ ok: true, models, recommended });
});
