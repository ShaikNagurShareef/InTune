"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
      className="grain min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5"
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
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-dashed border-line bg-card p-8 text-center">
          <p className="font-display text-2xl">It’s quiet here.</p>
          <p className="mt-1 text-ink-2">Write the first message below — a hello, or a plan for this week.</p>
        </div>
      ) : (
        <ol className="space-y-3" aria-live="polite" aria-relevant="additions">
          {visible.map((m) => (
            <MessageItem
              key={m.id}
              message={m}
              replyTo={m.replyToId ? byId.get(m.replyToId) : undefined}
              audioRate={audioRate}
              showSender={showSenders}
              onReply={onReply}
              onHide={(id) => setHidden((prev) => new Set(prev).add(id))}
              onChanged={() => void mutate()}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
