"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui";

interface Item {
  id: string;
  circleName: string;
  reason: string;
  includedText: string | null;
  createdAt: string;
}

export function ModerationQueue({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const resolve = async (id: string, action: "dismiss" | "remove") => {
    await api(`/api/v1/moderation/${id}`, { body: { action } }).catch(() => undefined);
    setItems((list) => list.filter((i) => i.id !== id));
  };
  if (!items.length) return <p className="text-lg text-ink-2">No open reports.</p>;
  return (
    <ul className="space-y-4">
      {items.map((i) => (
        <li key={i.id} className="rounded-2xl border border-line bg-card p-5">
          <p className="text-sm text-ink-2">{i.circleName} · {new Date(i.createdAt).toLocaleString()}</p>
          <p className="mt-1"><strong>Reason:</strong> {i.reason}</p>
          <blockquote className="mt-2 whitespace-pre-wrap border-l-4 border-line pl-3 text-ink-2">
            {i.includedText ?? "The reporter chose not to include the message text."}
          </blockquote>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => resolve(i.id, "dismiss")}>Dismiss</Button>
            <Button tone="danger" onClick={() => resolve(i.id, "remove")}>Remove message</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
