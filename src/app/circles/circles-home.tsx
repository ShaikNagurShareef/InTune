"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/client/api";
import { useHasGeminiKey } from "@/lib/client/byok";
import { shortTime } from "@/lib/client/time";
import { Avatar } from "@/components/avatar";
import { Button, Notice, inputClass } from "@/components/ui";
import { NewChat } from "./new-chat";
import { StatusPicker } from "@/components/status-picker";
import { StatusBadge } from "@/components/comm-card";
import { Invitations, type MyInvitation } from "./invitations";

interface ChatSummary {
  id: string;
  kind: "group" | "direct";
  name: string;
  role: string;
  unread: number;
  memberCount: number;
  otherUserId: string | null;
  otherStatus: string | null;
  last: { text: string | null; senderName: string; mine: boolean; at: string } | null;
  lastActivity: string;
}

type Filter = "all" | "group" | "direct";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "direct", label: "Direct" },
  { value: "group", label: "Circles" },
];
const POLL_MS = 5000;

function preview(c: ChatSummary): string {
  if (!c.last) return c.kind === "direct" ? "Say hello" : `${c.memberCount} ${c.memberCount === 1 ? "member" : "members"} · no messages yet`;
  const body = c.last.text ?? "Message deleted";
  if (c.last.mine) return `You: ${body}`;
  return c.kind === "group" ? `${c.last.senderName}: ${body}` : body;
}

function ChatRow({ chat, quiet }: { chat: ChatSummary; quiet: boolean }) {
  const hasUnread = !quiet && chat.unread > 0;
  return (
    <li>
      <Link href={`/circles/${chat.id}`} className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3 hover:bg-paper-2 focus-visible:bg-paper-2">
        <Avatar name={chat.name} seed={chat.otherUserId ?? chat.id} group={chat.kind === "group"} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`truncate text-lg ${hasUnread ? "font-bold" : "font-semibold"}`}>{chat.name}</span>
            {chat.kind === "group" && <span className="shrink-0 text-xs text-ink-2">Circle</span>}
            {chat.kind === "direct" && <StatusBadge status={chat.otherStatus} />}
            <time
              dateTime={chat.lastActivity}
              suppressHydrationWarning
              className={`ml-auto shrink-0 text-xs ${hasUnread ? "font-bold text-teal" : "text-ink-2"}`}
            >
              {shortTime(chat.lastActivity)}
            </time>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={`truncate text-sm ${hasUnread ? "text-ink" : "text-ink-2"} ${chat.last?.text === null ? "italic" : ""}`}>
              {preview(chat)}
            </span>
            {hasUnread && (
              <span className="ml-auto grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-teal px-1.5 text-xs font-bold text-teal-ink">
                {chat.unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function CirclesHome({ initial, quiet, invitations, name, status }: {
  initial: ChatSummary[];
  quiet: boolean;
  invitations: MyInvitation[];
  name: string;
  status: string;
}) {
  const router = useRouter();
  const hasKey = useHasGeminiKey();
  const { data } = useSWR<{ circles: ChatSummary[] }>("/api/v1/circles", fetcher, {
    fallbackData: { circles: initial },
    refreshInterval: POLL_MS,
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [isPicking, setIsPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chats = (data?.circles ?? initial).filter((c) => filter === "all" || c.kind === filter);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const circleName = String(new FormData(form).get("name") ?? "");
    try {
      const { id } = await api<{ id: string }>("/api/v1/circles", { body: { name: circleName } });
      form.reset();
      router.push(`/circles/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the circle.");
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="chats-heading" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal">Hello, {name}</p>
            <h1 id="chats-heading" className="font-display text-5xl font-semibold">Chats</h1>
          </div>
          <Button tone="primary" onClick={() => setIsPicking((v) => !v)} aria-expanded={isPicking}>
            ✎ New chat
          </Button>
        </div>
        <div className="mb-4"><StatusPicker initial={status} /></div>
        {isPicking && <div className="mb-4"><NewChat onClose={() => setIsPicking(false)} /></div>}
        <Invitations initial={invitations} />

        <div role="group" aria-label="Show" className="mb-3 flex gap-1 rounded-xl bg-paper-2 p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`min-h-11 flex-1 rounded-lg px-3 font-bold ${filter === f.value ? "bg-card shadow-[var(--shadow)]" : "text-ink-2 hover:text-ink"}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {chats.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-8">
            <p className="font-display text-2xl">{filter === "direct" ? "No direct chats yet." : "Nothing here yet."}</p>
            <p className="mt-2 text-ink-2">
              Create a circle for the people you talk with most, invite them with a private link, then chat together or one-to-one.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)]">
            {chats.map((c) => <ChatRow key={c.id} chat={c} quiet={quiet} />)}
          </ul>
        )}
      </section>

      <aside className="space-y-6">
        <form onSubmit={handleCreate} className="rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow)]">
          <h2 className="font-display text-2xl font-semibold">New circle</h2>
          <p className="mb-4 mt-1 text-sm text-ink-2">A private group of up to 20 people. Only members can read it.</p>
          <label className="block">
            <span className="mb-1 block font-bold">Circle name</span>
            <input name="name" required maxLength={80} placeholder="e.g. Sunday dinner" className={inputClass} />
          </label>
          {error && <div className="mt-3"><Notice tone="warn">{error}</Notice></div>}
          <Button tone="primary" type="submit" className="mt-4 w-full">Create circle</Button>
        </form>
        {!hasKey && (
          <div className="rounded-2xl border border-line bg-paper-2 p-5">
            <h2 className="font-bold">Want wording help?</h2>
            <p className="mt-1 text-sm text-ink-2">Add your own Gemini API key. It stays in this browser. You can message without it.</p>
            <Link href="/settings" className="mt-3 inline-flex min-h-11 items-center font-bold text-teal underline underline-offset-4">
              Add a key
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
