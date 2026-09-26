"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/client/api";
import { Avatar } from "@/components/avatar";
import { Button, Notice, inputClass } from "@/components/ui";

interface Contact {
  id: string;
  displayName: string;
}

/** Start a one-to-one chat with someone you already share a circle with. */
export function NewChat({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { data, isLoading } = useSWR<{ contacts: Contact[] }>("/api/v1/contacts", fetcher);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const contacts = (data?.contacts ?? []).filter((c) => c.displayName.toLowerCase().includes(query.trim().toLowerCase()));

  const open = async (userId: string) => {
    try {
      const { id } = await api<{ id: string }>("/api/v1/direct", { body: { user_id: userId } });
      router.push(`/circles/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open the chat.");
    }
  };

  return (
    <section aria-labelledby="new-chat-h" className="rounded-2xl border border-teal/30 bg-card p-4 shadow-[var(--shadow)]">
      <div className="flex items-center gap-2">
        <h2 id="new-chat-h" className="font-display flex-1 text-xl font-semibold">New chat</h2>
        <Button tone="ghost" onClick={onClose}>Close</Button>
      </div>
      <p className="mb-3 text-sm text-ink-2">You can message people you share a circle with. There’s no public directory.</p>
      <label className="block">
        <span className="sr-only">Search people</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people" className={inputClass} autoFocus />
      </label>
      {error && <div className="mt-3"><Notice tone="warn">{error}</Notice></div>}
      <ul className="mt-2 max-h-72 overflow-y-auto">
        {isLoading && <li className="p-3 text-ink-2">Loading…</li>}
        {!isLoading && contacts.length === 0 && (
          <li className="p-3 text-ink-2">
            {data?.contacts.length ? "No one matches." : "No one yet. Invite people to a circle first, then you can message them directly."}
          </li>
        )}
        {contacts.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => open(c.id)}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-paper-2"
            >
              <Avatar name={c.displayName} seed={c.id} size="sm" />
              <span className="font-bold">{c.displayName}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
