import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { createPhrase, listPhrases } from "@/lib/services/phrasebook";

const phraseBody = z.strictObject({
  phrase: z.string().trim().min(1).max(120),
  meaning: z.string().trim().min(1).max(500),
  example: z.string().trim().max(500).nullable(),
});

export const GET = route(async (req) => json({ phrases: await listPhrases((await requireUser(req)).id) }));

/** Called only after the person presses "Save this meaning" (FR26). */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  return json(await createPhrase(user.id, await parseJson(req, phraseBody)), 201);
});
