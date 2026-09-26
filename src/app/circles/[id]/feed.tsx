"use client";

import { useEffect, useMemo, useState } from "react";
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
  onReply: (target: ReplyTarget) => void;
}

/** Merges the polled latest page with older pages by ID, so polling and pagination never duplicate (FR06). */
export function Feed({ circleId, latest, seen, mutate, audioRate, onReply }: Props) {
  const [older, setOlder] = useState<FeedMessage[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const nextCursor = cursor === undefined ? latest.nextCursor : cursor;
  const messages = useMemo(() => {
    const byId = new Map<string, FeedMessage>();
    for (const m of [...older, ...seen, ...latest.messages]) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) =>
      a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
    );
  }, [older, seen, latest.messages]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const newestId = latest.messages[0]?.id;
  useEffect(() => {
    if (newestId) void api(`/api/v1/circles/${circleId}/read`, { method: "POST" }).catch(() => undefined);
  }, [circleId, newestId]);

  const loadOlder = async () => {
    if (!nextCursor) return;
    setIsLoadingOlder(true);
    const page = await api<FeedPage>(`/api/v1/circles/${circleId}/messages?before=${encodeURIComponent(nextCursor)}`).catch(() => null);
    if (page) {
      setOlder((prev) => [...page.messages, ...prev]);
      setCursor(page.nextCursor);
    }
    setIsLoadingOlder(false);
  };

  const visible = messages.filter((m) => !hidden.has(m.id));

  return (
    <section aria-labelledby="feed-heading" className="space-y-3">
      <h2 id="feed-heading" className="sr-only">Messages</h2>
      {nextCursor && (
        <div className="flex justify-center">
          <Button tone="ghost" onClick={loadOlder} disabled={isLoadingOlder}>
            {isLoadingOlder ? "Loading…" : "Show earlier messages"}
          </Button>
        </div>
      )}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center">
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
