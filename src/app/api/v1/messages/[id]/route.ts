import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { deleteMessage, editMessage } from "@/lib/services/messages";
import { messageText } from "@/lib/validation";

type P = Ctx<{ id: string }>;

export const PATCH = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  const { text, expected_version } = await parseJson(
    req,
    z.strictObject({ text: messageText, expected_version: z.number().int().positive() }),
  );
  await editMessage(user.id, await idParam(ctx, "id"), text, expected_version);
  return json({ ok: true });
});

export const DELETE = route<P>(async (req, ctx) => {
  const user = await requireUser(req);
  await deleteMessage(user.id, await idParam(ctx, "id"));
  return json({ ok: true });
});
