"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { PhoneCall, Search, SquarePen } from "lucide-react";
import { fetcher } from "@/lib/client/api";
import { shortTime } from "@/lib/client/time";
import { Avatar } from "@/components/avatar";
import { StatusMenu } from "@/components/status-picker";
import { NewSheet } from "./new-sheet";
import { Requests } from "./requests";
import type { ChatSummary, MyInvitation } from "./types";

type Tab = "all" | "direct" | "group" | "requests";
const POLL_MS = 4000;

function preview(c: ChatSummary): string {
  if (!c.last) return c.kind === "direct" ? "Say hello 👋" : `${c.memberCount} members · no messages yet`;
  const body = c.last.text ?? "Message deleted";
  if (c.last.mine) return `You: ${body}`;
  return c.kind === "group" ? `${c.last.senderName}: ${body}` : body;
}

function Row({ chat, quiet, active }: { chat: ChatSummary; quiet: boolean; active: boolean }) {
  const unread = !quiet && chat.unread > 0;
  return (
    <li>
      <Link
        href={`/circles/${chat.id}`}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-[4.5rem] items-center gap-3 px-4 py-2 transition hover:bg-paper-2 ${active ? "bg-paper-2" : ""}`}
      >
        <Avatar
          name={chat.name}
          seed={chat.otherUserId ?? chat.id}
          group={chat.kind === "group"}
          status={chat.kind === "direct" ? chat.otherStatus : null}
        />
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${unread ? "font-extrabold" : "font-semibold"}`}>{chat.name}</span>
          <span className={`flex items-center gap-1 text-sm ${unread ? "font-bold text-ink" : "text-ink-2"}`}>
            <span className={`truncate ${chat.last?.text === null ? "italic" : ""}`}>{preview(chat)}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={chat.lastActivity} suppressHydrationWarning className="shrink-0">{shortTime(chat.lastActivity)}</time>
          </span>
        </span>
        {chat.live && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sage-soft px-2 py-0.5 text-xs font-bold text-sage">
            <PhoneCall aria-hidden="true" className="h-3.5 w-3.5" /> Live
          </span>
        )}
        {unread && (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-teal px-1.5 text-xs font-bold text-on-brand">
            {chat.unread}
            <span className="sr-only"> unread</span>
          </span>
        )}
      </Link>
    </li>
  );
}

interface Props {
  me: { id: string; displayName: string };
  initialChats: ChatSummary[];
  initialInvitations: MyInvitation[];
  quiet: boolean;
  status: string;
}

export function ChatList({ me, initialChats, initialInvitations, quiet, status }: Props) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const isNewOpen = params.get("new") === "1";
  const { data } = useSWR<{ circles: ChatSummary[] }>("/api/v1/circles", fetcher, {
    fallbackData: { circles: initialChats },
    refreshInterval: POLL_MS,
  });
  const { data: inv, mutate: refreshInvites } = useSWR<{ invitations: MyInvitation[] }>("/api/v1/invitations", fetcher, {
    fallbackData: { invitations: initialInvitations },
    refreshInterval: POLL_MS,
  });
  const invitations = inv?.invitations ?? [];
  const [tab, setTab] = useState<Tab>(initialInvitations.length ? "requests" : "all");
  const [query, setQuery] = useState("");

  const chats = data?.circles ?? initialChats;
  const q = query.trim().toLowerCase();
  const filtered = chats.filter(
    (c) => (tab === "all" || c.kind === tab) && (!q || c.name.toLowerCase().includes(q)),
  );
  const circles = chats.filter((c) => c.kind === "group");
  const activeId = path.split("/")[2];

  const TABS: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "direct", label: "Direct" },
    { id: "group", label: "Circles" },
    { id: "requests", label: invitations.length ? `Requests (${invitations.length})` : "Requests" },
  ];

  return (
    <section aria-labelledby="chats-h" className="flex h-full flex-col">
      <header className="flex items-center gap-2 px-4 pb-2 pt-5">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-ink-2">{me.displayName}</p>
          <h1 id="chats-h" className="text-2xl font-extrabold leading-tight">Chats</h1>
        </div>
        <button
          type="button"
          onClick={() => router.push("/circles?new=1")}
          aria-label="New message or circle"
          className="ml-auto grid h-11 w-11 place-items-center rounded-full hover:bg-paper-2"
        >
          <SquarePen aria-hidden="true" className="h-6 w-6" />
        </button>
      </header>
      <div className="px-4 pb-3">
        <StatusMenu initial={status} />
      </div>

      <div className="px-4 pb-3">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-paper-2 px-3 focus-within:ring-2 focus-within:ring-teal">
          <Search aria-hidden="true" className="h-4 w-4 text-ink-2" />
          <span className="sr-only">Filter your chats</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter your chats"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-2"
          />
        </label>
      </div>

      {circles.length > 0 && (
        <ul aria-label="Your circles" className="scrollbar-none flex gap-4 overflow-x-auto px-4 pb-3">
          {circles.map((c) => (
            <li key={c.id} className="shrink-0">
              <Link href={`/circles/${c.id}`} className="flex w-[72px] flex-col items-center gap-1 rounded-xl">
                <Avatar name={c.name} seed={c.id} size="md" ring={!quiet && c.unread > 0} />
                <span className="w-full truncate text-center text-xs">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div role="tablist" aria-label="Show" className="scrollbar-none flex gap-5 overflow-x-auto border-b border-line px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 text-sm font-bold transition ${
              tab === t.id ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {tab === "requests" ? (
          <Requests invitations={invitations} onChange={() => void refreshInvites()} />
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-ink-2">
            <p className="font-bold text-ink">{q ? "No chats match." : "No conversations yet."}</p>
            <p className="mt-1 text-sm">Create a circle, invite people by email, then chat together or one-to-one.</p>
          </div>
        ) : (
          <ul>
            {filtered.map((c) => <Row key={c.id} chat={c} quiet={quiet} active={c.id === activeId} />)}
          </ul>
        )}
      </div>

      {isNewOpen && <NewSheet onClose={() => router.push(activeId ? `/circles/${activeId}` : "/circles")} />}
    </section>
  );
}
