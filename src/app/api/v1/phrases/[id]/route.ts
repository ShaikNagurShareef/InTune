import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { deletePhrase, updatePhrase } from "@/lib/services/phrasebook";

type P = Ctx<{ id: string }>;

const body = z.strictObject({
  expected_revision: z.number().int().positive(),
  phrase: z.string().trim().min(1).max(120),
  meaning: z.string().trim().min(1).max(500),
  example: z.string().trim().max(500).nullable(),
});

export const PATCH = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  const { expected_revision, ...input } = await parseJson(req, body);
  return json(await updatePhrase(user.id, await idParam(ctx, "id"), expected_revision, input));
});

export const DELETE = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  await deletePhrase(user.id, await idParam(ctx, "id"));
  return json({ ok: true });
});
