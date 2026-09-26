import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { idParam, type Ctx } from "@/lib/api";
import { recordEvent } from "@/lib/metrics";
import { approveDraft } from "@/lib/services/publish";
import { AppError } from "@/lib/errors";
import { draftText } from "@/lib/validation";

const body = z.strictObject({
  expected_version: z.number().int().positive(),
  previewed_text: draftText,
  acknowledged_flags: z.boolean(),
});

/** Binds exact content and audience. Requires an authenticated human request; never callable by the model. */
export const POST = route<Ctx<{ id: string }>>(async (req, ctx) => {
  const user = await requireUser(req);
  const input = await parseJson(req, body);
  try {
    const result = await approveDraft(
      user.id,
      await idParam(ctx, "id"),
      input.expected_version,
      input.previewed_text,
      input.acknowledged_flags,
    );
    void recordEvent("approval_created", {}, user.id);
    return json({ approval_id: result.approvalId, draft_version: result.draftVersion, audience_size: result.audience }, 201);
  } catch (err) {
    if (err instanceof AppError) void recordEvent("approval_rejected", { code: err.code }, user.id);
    throw err;
  }
});
