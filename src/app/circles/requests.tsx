"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { Avatar } from "@/components/avatar";
import { Notice } from "@/components/ui";
import type { MyInvitation } from "./types";

/** Invitations addressed to you: see who's in the circle, then Join or Decline — no reason needed (J1). */
export function Requests({ invitations, onChange }: { invitations: MyInvitation[]; onChange: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const join = async (inv: MyInvitation) => {
    try {
      const { circleId } = await api<{ circleId: string }>(`/api/v1/invitations/${inv.id}/accept`, { method: "POST" });
      onChange();
      router.push(`/circles/${circleId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't join.");
      onChange();
    }
  };
  const decline = async (inv: MyInvitation) => {
    await api(`/api/v1/invitations/${inv.id}/decline`, { method: "POST" }).catch(() => undefined);
    onChange();
    router.refresh();
  };

  if (!invitations.length) {
    return (
      <div className="p-8 text-center text-ink-2">
        <Inbox aria-hidden="true" className="mx-auto h-10 w-10" strokeWidth={1.5} />
        <p className="mt-2 font-bold text-ink">No invitations</p>
        <p className="mt-1 text-sm">When someone invites your email to a circle, it appears here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-4">
      {error && <Notice tone="warn">{error}</Notice>}
      {invitations.map((inv) => (
        <article key={inv.id} className="rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow)]">
          <div className="flex items-start gap-3">
            <Avatar name={inv.circleName} seed={inv.circleId} group size="sm" ring />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <strong>{inv.inviterName}</strong> invited you to join
              </p>
              <h3 className="truncate text-lg font-extrabold">{inv.circleName}</h3>
              <p className="mt-1 text-sm text-ink-2">Who will read your posts: {inv.members.join(", ")}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => join(inv)}
              className="bg-brand inline-flex min-h-11 items-center justify-center gap-2 rounded-xl font-bold text-on-brand hover:brightness-110"
            >
              <Check aria-hidden="true" className="h-4 w-4" /> Join circle
            </button>
            <button
              type="button"
              onClick={() => decline(inv)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-paper-2 font-bold hover:brightness-95"
            >
              <X aria-hidden="true" className="h-4 w-4" /> No, thanks
            </button>
          </div>
        </article>
      ))}
      <p className="px-1 text-xs text-ink-2">Declining needs no reason and just closes the invitation.</p>
    </div>
  );
}
