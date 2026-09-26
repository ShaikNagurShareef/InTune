import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { credentialsFromRequest, listModels } from "@/lib/gemini/client";
import { PREFERRED_MODELS } from "@/lib/gemini/config";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";

/** Checks a BYOK key by listing models. The key is used for this call only and is not stored. */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  await rateLimit(`keytest:${user.id}`, 20, 3600);
  const creds = credentialsFromRequest(req);
  // Only ever test a key the person pasted — never the shared server key.
  if (creds.source !== "user") throw new AppError("invalid_input", "Paste a Gemini API key to test it.");
  const { apiKey } = creds;
  const models = await listModels(apiKey);
  const recommended = PREFERRED_MODELS.find((m) => models.includes(m)) ?? models.find((m) => m.includes("flash")) ?? models[0] ?? null;
  return json({ ok: true, models, recommended });
});
