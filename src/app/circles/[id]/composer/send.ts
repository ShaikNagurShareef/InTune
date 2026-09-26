"use client";

import { api, ApiError, newIdempotencyKey } from "@/lib/client/api";
import type { Draft } from "./types";

/** Approvals and idempotency keys per draft version, so a retry after a lost response replays one message. */
export interface SendCache {
  approvals: Map<string, string>;
  keys: Map<string, string>;
}

export const newSendCache = (): SendCache => ({ approvals: new Map(), keys: new Map() });

function remembered(map: Map<string, string>, scope: string, make: () => string): string {
  const existing = map.get(scope);
  if (existing) return existing;
  const value = make();
  map.set(scope, value);
  return value;
}

/**
 * Approves the exact text of this draft version (AI-assisted drafts only) and publishes it.
 * On a stale version the cached approval and key are dropped so the next attempt starts fresh.
 */
export async function approveAndPublish(circleId: string, draft: Draft, acknowledged: boolean, cache: SendCache): Promise<void> {
  const scope = `${draft.id}:${draft.version}`;
  try {
    let approvalId = cache.approvals.get(scope);
    if (!approvalId) {
      const approval = await api<{ approval_id: string }>(`/api/v1/drafts/${draft.id}/approve`, {
        body: { expected_version: draft.version, previewed_text: draft.text, acknowledged_flags: acknowledged },
      });
      approvalId = approval.approval_id;
      cache.approvals.set(scope, approvalId);
    }
    await api(`/api/v1/messages`, {
      body: {
        circle_id: circleId,
        text: draft.text,
        reply_to_id: draft.replyToId,
        tone_tags: draft.toneTags,
        draft_id: draft.id,
        approval_id: draft.aiAssisted ? approvalId : null,
      },
      idempotencyKey: remembered(cache.keys, scope, newIdempotencyKey),
    });
  } catch (err) {
    if (err instanceof ApiError && err.code === "stale_version") {
      cache.approvals.delete(scope);
      cache.keys.delete(scope);
    }
    throw err;
  }
}
