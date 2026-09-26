"use client";

import { useRouter } from "next/navigation";
import { Ban, Lock } from "lucide-react";
import { api } from "@/lib/client/api";
import { statusInfo } from "@/lib/social";
import { Avatar } from "@/components/avatar";
import { CommCardView } from "@/components/comm-card";
import type { CircleInfo, Me } from "./types";

/** Details for a one-to-one chat: who it is, how to talk with them, privacy, and block. */
export function DirectPanel({ circle, me }: { circle: CircleInfo; me: Me }) {
  const router = useRouter();
  const other = circle.members.find((m) => m.id !== me.id);
  const status = statusInfo(other?.status ?? "none");
  const block = async () => {
    if (!other || !confirm(`Block ${other.displayName}? You won't see their messages or be able to message each other.`)) return;
    await api("/api/v1/blocks", { body: { user_id: other.id } }).catch(() => undefined);
    router.push("/circles");
    router.refresh();
  };
  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-col items-center text-center">
        <Avatar name={circle.name} seed={other?.id ?? circle.id} size="lg" status={other?.status} />
        <h2 className="mt-3 text-xl font-extrabold">{circle.name}</h2>
        {status.id !== "none" ? (
          <p className="mt-1 rounded-full bg-amber-soft px-3 py-1 text-sm font-semibold text-amber-ink">
            {status.icon} {status.label}
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-2">Direct chat</p>
        )}
      </div>
      {other && <CommCardView name={other.displayName} card={other.commCard} />}
      {other && !other.commCard && (
        <p className="rounded-2xl bg-paper-2 p-3 text-sm text-ink-2">{other.displayName} hasn’t added a “How to talk with me” card yet.</p>
      )}
      <p className="flex items-start gap-2 text-sm text-ink-2">
        <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        Only the two of you can read this chat. Your messages go through your review before sending, and reading help you open is only for you.
      </p>
      {other && (
        <button type="button" onClick={block} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-clay/40 font-bold text-clay hover:bg-clay-soft">
          <Ban aria-hidden="true" className="h-4 w-4" /> Block {other.displayName}
        </button>
      )}
    </div>
  );
}
