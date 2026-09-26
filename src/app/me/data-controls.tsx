"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { setGeminiKey } from "@/lib/client/byok";
import { Button, Notice } from "@/components/ui";

export function BlockedList({ initial }: { initial: { id: string; displayName: string }[] }) {
  const [blocked, setBlocked] = useState(initial);
  if (!blocked.length) return <p className="mt-2 text-ink-2">You haven’t blocked anyone.</p>;
  return (
    <ul className="mt-2 space-y-1">
      {blocked.map((b) => (
        <li key={b.id} className="flex items-center gap-2">
          <span className="flex-1 font-bold">{b.displayName}</span>
          <Button
            tone="ghost"
            className="text-sm"
            onClick={async () => {
              await api(`/api/v1/blocks/${b.id}`, { method: "DELETE" }).catch(() => undefined);
              setBlocked((list) => list.filter((x) => x.id !== b.id));
            }}
          >
            Unblock
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function DataControls() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);

  const deleteDrafts = async () => {
    if (!confirm("Delete all your unsent drafts and recordings?")) return;
    await api("/api/v1/account/delete-drafts", { method: "POST" });
    setNote("Drafts and recordings deleted.");
  };

  const deleteAccount = async () => {
    if (!confirm("Delete your account? Your messages become “deleted”, your phrasebook and drafts are erased, and you are signed out. This cannot be undone.")) return;
    await api("/api/v1/account", { method: "DELETE" });
    setGeminiKey(null);
    router.push("/");
    router.refresh();
  };

  return (
    <div className="mt-2 space-y-3">
      <p className="text-sm text-ink-2">
        Recordings are erased after they are turned into words, or within 24 hours. Unsent drafts are removed after 24 hours.
        Copies other people already saw, or data held by Google under your key’s terms, are outside InTune’s control.
      </p>
      {note && <Notice tone="ok">{note}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={deleteDrafts}>Delete drafts and recordings</Button>
        <Button tone="danger" onClick={deleteAccount}>Delete my account</Button>
      </div>
    </div>
  );
}
