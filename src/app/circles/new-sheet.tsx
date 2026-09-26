"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { MessageCircle, Search, UsersRound } from "lucide-react";
import { api, ApiError, fetcher } from "@/lib/client/api";
import { Avatar } from "@/components/avatar";
import { Modal } from "@/components/modal";
import { Notice } from "@/components/ui";

interface Contact {
  id: string;
  displayName: string;
}

type Tab = "message" | "circle";

/** New message (people you share a circle with — no public directory) or a new private circle. */
export function NewSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("message");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useSWR<{ contacts: Contact[] }>("/api/v1/contacts", fetcher);
  const contacts = (data?.contacts ?? []).filter((c) => c.displayName.toLowerCase().includes(query.trim().toLowerCase()));

  const open = async (userId: string) => {
    try {
      const { id } = await api<{ id: string }>("/api/v1/direct", { body: { user_id: userId } });
      router.push(`/circles/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open the chat.");
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    try {
      const { id } = await api<{ id: string }>("/api/v1/circles", { body: { name } });
      router.push(`/circles/${id}?details=1`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the circle.");
    }
  };

  const tabs: { id: Tab; label: string; icon: typeof MessageCircle }[] = [
    { id: "message", label: "Message someone", icon: MessageCircle },
    { id: "circle", label: "New circle", icon: UsersRound },
  ];

  return (
    <Modal title="New" onClose={onClose}>
      <div role="tablist" className="grid grid-cols-2 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px inline-flex min-h-12 items-center justify-center gap-2 border-b-2 text-sm font-bold ${
              tab === t.id ? "border-ink" : "border-transparent text-ink-2"
            }`}
          >
            <t.icon aria-hidden="true" className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {error && <div className="p-4 pb-0"><Notice tone="warn">{error}</Notice></div>}

      {tab === "message" ? (
        <div className="p-4">
          <label className="flex h-11 items-center gap-2 rounded-xl bg-paper-2 px-3 focus-within:ring-2 focus-within:ring-teal">
            <Search aria-hidden="true" className="h-4 w-4 text-ink-2" />
            <span className="sr-only">Filter people</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="People from your circles" className="flex-1 bg-transparent text-sm outline-none" />
          </label>
          <p className="mt-2 text-xs text-ink-2">You can message people you share a circle with. There’s no public directory.</p>
          <ul className="mt-3">
            {isLoading && <li className="p-3 text-ink-2">Loading…</li>}
            {!isLoading && contacts.length === 0 && (
              <li className="p-3 text-sm text-ink-2">
                {data?.contacts.length ? "No one matches." : "No one yet. Create a circle and invite people first."}
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
                  <span className="flex-1 font-semibold">{c.displayName}</span>
                  <MessageCircle aria-hidden="true" className="h-5 w-5 text-ink-2" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <form onSubmit={create} className="space-y-4 p-4">
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Circle name</span>
            <input name="name" required maxLength={80} placeholder="e.g. Board game night" className="h-12 w-full rounded-xl border border-line bg-paper-2 px-3 outline-none focus:border-teal" />
          </label>
          <p className="text-sm text-ink-2">Private, up to 20 people. You’ll invite people by email next, and they join from their Requests.</p>
          <button type="submit" className="bg-brand min-h-12 w-full rounded-xl font-bold text-white hover:brightness-110">Create circle</button>
        </form>
      )}
    </Modal>
  );
}
