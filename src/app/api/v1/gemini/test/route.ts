import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { credentialsFromRequest, listModels, pickModel } from "@/lib/gemini/client";
import { listOpenAiModels, rankOpenAiModels } from "@/lib/gemini/openai";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";

/**
 * Checks a person's own key (Gemini or OpenAI, per the x-ai-provider header) by listing models.
 * The key is used for this call only and is not stored; the shared server key is never tested here.
 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  await rateLimit(`keytest:${user.id}`, 20, 3600);
  const creds = credentialsFromRequest(req);
  if (creds.source !== "user") throw new AppError("invalid_input", "Paste an API key to test it.");
  if (creds.provider === "openai") {
    const models = rankOpenAiModels(await listOpenAiModels(creds.apiKey).catch(() => {
      throw new AppError("ai_key_missing", "OpenAI did not accept this key.");
    }));
    return json({ ok: true, provider: "openai", models, recommended: models[0] ?? null });
  }
  const models = await listModels(creds.apiKey);
  return json({ ok: true, provider: "gemini", models, recommended: pickModel(models) ?? models[0] ?? null });
});
