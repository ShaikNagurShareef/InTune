import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";

export type MetricKind =
  | "model_call"
  | "assist_outcome"
  | "approval_created"
  | "approval_rejected"
  | "send"
  | "simplify"
  | "report_created";

/** Content-free operational events: never message text, prompts, media or keys (spec §10 observability). */
export async function recordEvent(
  kind: MetricKind,
  meta: Record<string, string | number | boolean | null>,
  userId: string | null = null,
): Promise<void> {
  await db()
    .insert(auditEvents)
    .values({ kind, meta, userId })
    .catch(() => undefined);
}
