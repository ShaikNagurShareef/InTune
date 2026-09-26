"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui";
import type { CircleInfo, Me } from "./types";

/** Side panel for one-to-one chats: who it is, privacy, and block. No invites or ownership here. */
export function DirectPanel({ circle, me }: { circle: CircleInfo; me: Me }) {
  const router = useRouter();
  const other = circle.members.find((m) => m.id !== me.id);
  const block = async () => {
    if (!other || !confirm(`Block ${other.displayName}? You won't see their messages or be able to message each other.`)) return;
    await api("/api/v1/blocks", { body: { user_id: other.id } }).catch(() => undefined);
    router.push("/circles");
  };
  return (
    <aside className="space-y-4 rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center gap-3">
        <Avatar name={circle.name} seed={other?.id ?? circle.id} />
        <div>
          <h2 className="font-display text-xl font-semibold">{circle.name}</h2>
          <p className="text-sm text-ink-2">Direct chat</p>
        </div>
      </div>
      <p className="text-sm text-ink-2">
        Only the two of you can read this chat. Messages still go through your review before sending, and any
        simpler version you open is only for you.
      </p>
      {other && <Button tone="danger" onClick={block}>Block {other.displayName}</Button>}
    </aside>
  );
}
