"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyedMutator } from "swr";
import { api } from "@/lib/client/api";
import { Button } from "@/components/ui";
import { MessageItem } from "./message-item";
import type { FeedMessage, FeedPage, ReplyTarget } from "./types";

interface Props {
  circleId: string;
  latest: FeedPage;
  seen: FeedMessage[];
  mutate: KeyedMutator<FeedPage>;
  audioRate: number;
  showSenders: boolean;
  onReply: (target: ReplyTarget) => void;
}

const NEAR_BOTTOM_PX = 120;
const GROUP_GAP_MS = 5 * 60 * 1000;
const SEPARATOR_GAP_MS = 30 * 60 * 1000;

const ms = (iso: string) => new Date(iso).getTime();

/** "Today 3:04 PM", "Tue 3:04 PM", "12 Sep, 3:04 PM" — centred between conversation bursts. */
function separatorLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  if ((now.getTime() - d.getTime()) / 86_400_000 < 6) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

/** Merges polled and older pages by ID, so polling and pagination never duplicate (FR06). */
export function Feed({ circleId, latest, seen, mutate, audioRate, showSenders, onReply }: Props) {
  const [older, setOlder] = useState<FeedMessage[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLElement | null>(null);
  const stickToBottom = useRef(true);
  const restoreFrom = useRef<number | null>(null);

  const nextCursor = cursor === undefined ? latest.nextCursor : cursor;
  const messages = useMemo(() => {
    const byId = new Map<string, FeedMessage>();
    for (const m of [...older, ...seen, ...latest.messages]) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) =>
      a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
    );
  }, [older, seen, latest.messages]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const visible = messages.filter((m) => !hidden.has(m.id));
  const newestId = visible.at(-1)?.id;

  useEffect(() => {
    if (newestId) void api(`/api/v1/circles/${circleId}/read`, { method: "POST" }).catch(() => undefined);
  }, [circleId, newestId]);

  // Follow new messages like a chat app, but never yank someone who scrolled up to read.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restoreFrom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFrom.current;
      restoreFrom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [newestId, visible.length]);

  // Keep the newest message in view when the pane resizes (e.g. the composer finishes loading or grows).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  const loadOlder = async () => {
    if (!nextCursor) return;
    setIsLoadingOlder(true);
    const page = await api<FeedPage>(`/api/v1/circles/${circleId}/messages?before=${encodeURIComponent(nextCursor)}`).catch(() => null);
    if (page) {
      const el = scrollRef.current;
      restoreFrom.current = el ? el.scrollHeight - el.scrollTop : null;
      setOlder((prev) => [...page.messages, ...prev]);
      setCursor(page.nextCursor);
    }
    setIsLoadingOlder(false);
  };

  return (
    <section
      ref={scrollRef}
      onScroll={handleScroll}
      aria-labelledby="feed-heading"
      className="min-h-0 flex-1 overflow-y-auto px-2 py-4 sm:px-4"
    >
      <h2 id="feed-heading" className="sr-only">Messages</h2>
      {nextCursor && (
        <div className="flex justify-center">
          <Button tone="ghost" onClick={loadOlder} disabled={isLoadingOlder}>
            {isLoadingOlder ? "Loading…" : "Show earlier messages"}
          </Button>
        </div>
      )}
      {visible.length === 0 ? (
        <div className="mx-auto mt-12 max-w-sm text-center">
          <p className="text-4xl" aria-hidden="true">👋</p>
          <p className="mt-2 text-lg font-extrabold">Start the conversation</p>
          <p className="mt-1 text-sm text-ink-2">Say hello, or share a plan. You can add a tone so it’s easy to read.</p>
        </div>
      ) : (
        <ol aria-live="polite" aria-relevant="additions">
          {visible.map((m, i) => {
            const prev = visible[i - 1];
            const next = visible[i + 1];
            const newBurst = !prev || ms(m.createdAt) - ms(prev.createdAt) > SEPARATOR_GAP_MS;
            const startsGroup = newBurst || prev.senderId !== m.senderId || ms(m.createdAt) - ms(prev.createdAt) > GROUP_GAP_MS;
            const endsGroup =
              !next || next.senderId !== m.senderId || ms(next.createdAt) - ms(m.createdAt) > GROUP_GAP_MS;
            return (
              <Fragment key={m.id}>
                {newBurst && (
                  <li aria-hidden="true" className="py-3 text-center text-xs font-semibold text-ink-2" suppressHydrationWarning>
                    {separatorLabel(m.createdAt)}
                  </li>
                )}
                <MessageItem
                  message={m}
                  replyTo={m.replyToId ? byId.get(m.replyToId) : undefined}
                  audioRate={audioRate}
                  showSender={showSenders}
                  startsGroup={startsGroup}
                  endsGroup={endsGroup}
                  onReply={onReply}
                  onHide={(id) => setHidden((prev) => new Set(prev).add(id))}
                  onChanged={() => void mutate()}
                />
              </Fragment>
            );
          })}
        </ol>
      )}
    </section>
  );
}
