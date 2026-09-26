"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, Notice } from "@/components/ui";
import type { InvitePreview } from "@/lib/services/invites";

/** Shows circle, inviter and current audience; the person can decline without giving a reason (J1). */
export function InviteDecision({ token, preview }: { token: string; preview: InvitePreview }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);

  const accept = async () => {
    try {
      const { circleId } = await api<{ circleId: string }>(`/api/v1/invites/${encodeURIComponent(token)}/accept`, { method: "POST" });
      router.push(`/circles/${circleId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't join.");
    }
  };
  const decline = async () => {
    await api(`/api/v1/invites/${encodeURIComponent(token)}/decline`, { method: "POST" }).catch(() => undefined);
    setDeclined(true);
  };

  if (declined) {
    return <Notice tone="ok" title="Declined">Nothing else happens. You don’t need to explain.</Notice>;
  }
  return (
    <div className="rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow)]">
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal">{preview.inviterName} invited you</p>
      <h1 className="font-display mt-1 text-4xl font-semibold">{preview.circleName}</h1>
      <h2 className="mt-6 font-bold">People who will read what you post here</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {preview.members.map((m) => (
          <li key={m} className="rounded-full bg-paper-2 px-3 py-1">{m}</li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-ink-2">
        You’ll see posts from after you join. You can leave at any time. This invitation expires {new Date(preview.expiresAt).toLocaleString()}.
      </p>
      {error && <div className="mt-4"><Notice tone="warn">{error}</Notice></div>}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button tone="primary" onClick={accept}>Join circle</Button>
        <Button tone="ghost" onClick={decline}>No, thanks</Button>
      </div>
    </div>
  );
}
