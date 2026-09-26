"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/client/api";
import { Avatar } from "@/components/avatar";
import { Button, Notice } from "@/components/ui";

export interface MyInvitation {
  id: string;
  circleId: string;
  circleName: string;
  inviterName: string;
  members: string[];
  expiresAt: string;
}

const POLL_MS = 5000;

/** Invitations addressed to you, answered right here: see who's in the circle, then Join or Decline (J1). */
export function Invitations({ initial }: { initial: MyInvitation[] }) {
  const router = useRouter();
  const { data, mutate } = useSWR<{ invitations: MyInvitation[] }>("/api/v1/invitations", fetcher, {
    fallbackData: { invitations: initial },
    refreshInterval: POLL_MS,
  });
  const [error, setError] = useState<string | null>(null);
  const invitations = data?.invitations ?? [];
  if (!invitations.length) return null;

  const join = async (inv: MyInvitation) => {
    try {
      const { circleId } = await api<{ circleId: string }>(`/api/v1/invitations/${inv.id}/accept`, { method: "POST" });
      router.push(`/circles/${circleId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't join.");
      await mutate();
    }
  };
  const decline = async (inv: MyInvitation) => {
    await api(`/api/v1/invitations/${inv.id}/decline`, { method: "POST" }).catch(() => undefined);
    await mutate({ invitations: invitations.filter((i) => i.id !== inv.id) }, { revalidate: true });
    router.refresh();
  };

  return (
    <section aria-labelledby="invites-h" className="mb-5 space-y-3">
      <h2 id="invites-h" className="text-sm font-bold uppercase tracking-[0.14em] text-teal">
        Invitations · {invitations.length}
      </h2>
      {error && <Notice tone="warn">{error}</Notice>}
      <ul className="space-y-3">
        {invitations.map((inv) => (
          <li key={inv.id} className="rounded-2xl border border-teal/30 bg-teal-soft/60 p-4 shadow-[var(--shadow)]">
            <div className="flex items-start gap-3">
              <Avatar name={inv.circleName} seed={inv.circleId} group />
              <div className="min-w-0 flex-1">
                <p className="text-lg">
                  <strong>{inv.inviterName}</strong> invited you to <strong>{inv.circleName}</strong>
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  Who will read your posts: {inv.members.join(", ")}
                </p>
                <p className="text-xs text-ink-2" suppressHydrationWarning>
                  Expires {new Date(inv.expiresAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button tone="primary" onClick={() => join(inv)}>Join circle</Button>
              <Button tone="ghost" onClick={() => decline(inv)}>No, thanks</Button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-2">You don’t need to give a reason. Declining just closes the invitation.</p>
    </section>
  );
}
