"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/client/api";
import dynamic from "next/dynamic";
import type { UploadMode } from "./composer/upload";
import type { InputMode } from "./composer/types";
import { Feed } from "./feed";
import { MembersPanel } from "./members-panel";
import { DirectPanel } from "./direct-panel";
import { Avatar } from "@/components/avatar";
import { HeaderHeight } from "@/components/header-height";
import { Button } from "@/components/ui";
import type { CircleInfo, FeedPage, Me, PhraseLite, ReplyTarget } from "./types";

const POLL_MS = 3000;

// Client-only: the composer restores unsent words from this tab's session storage on first render.
const Composer = dynamic(() => import("./composer/composer").then((m) => m.Composer), {
  ssr: false,
  loading: () => <div className="h-48 rounded-2xl border border-line bg-card" aria-hidden="true" />,
});

interface Props {
  me: Me;
  circle: CircleInfo;
  initialPage: FeedPage;
  prefs: { inputMode: string; audioRate: number };
  phrases: PhraseLite[];
  uploadMode: UploadMode;
}

export function CircleView({ me, circle, initialPage, prefs, phrases, uploadMode }: Props) {
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  // Every message seen in any poll, by id, so nothing falls into a gap between the newest page and older pages.
  const [seen, setSeen] = useState(() => new Map(initialPage.messages.map((m) => [m.id, m])));
  const { data, mutate, error } = useSWR<FeedPage>(`/api/v1/circles/${circle.id}/messages`, fetcher, {
    fallbackData: initialPage,
    refreshInterval: POLL_MS,
    onSuccess: (page) =>
      setSeen((prev) => {
        const next = new Map(prev);
        for (const m of page.messages) next.set(m.id, m);
        return next;
      }),
  });

  const isDirect = circle.kind === "direct";
  const subtitle = isDirect
    ? "Direct chat · only you two"
    : `Circle · ${circle.members.length} ${circle.members.length === 1 ? "member" : "members"}`;

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--app-header-h,4.75rem))] max-w-6xl gap-6 sm:px-4 sm:py-4">
      <HeaderHeight />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-line bg-paper sm:rounded-2xl sm:border">
        <header className="flex shrink-0 items-center gap-3 border-b border-line bg-card px-3 py-2">
          <Link href="/circles" aria-label="Back to chats" className="grid h-11 w-11 place-items-center rounded-full text-xl hover:bg-paper-2">
            ←
          </Link>
          <Avatar name={circle.name} seed={isDirect ? (circle.members.find((m) => m.id !== me.id)?.id ?? circle.id) : circle.id} group={!isDirect} size="sm" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-2xl font-semibold leading-tight">{circle.name}</h1>
            <p className="truncate text-sm text-ink-2">{subtitle}</p>
          </div>
          <Button tone="ghost" className="lg:hidden" aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
            {isDirect ? "Info" : "Members"}
          </Button>
        </header>
        {showInfo && (
          <div className="max-h-[50%] shrink-0 overflow-y-auto border-b border-line p-3 lg:hidden">
            {isDirect ? <DirectPanel circle={circle} me={me} /> : <MembersPanel circle={circle} me={me} />}
          </div>
        )}
        {error && (
          <p role="alert" className="shrink-0 bg-clay-soft px-4 py-2 text-sm">
            You may no longer have access to this chat, or you’re offline. New messages will appear when it’s back.
          </p>
        )}
        <Feed
          circleId={circle.id}
          latest={data ?? initialPage}
          seen={[...seen.values()]}
          mutate={mutate}
          audioRate={prefs.audioRate}
          showSenders={!isDirect}
          onReply={setReplyTo}
        />
        <div className="max-h-[55%] shrink-0 overflow-y-auto border-t border-line bg-paper-2/60 p-2">
        <Composer
          circle={circle}
          me={me}
          replyTo={replyTo}
          onClearReply={() => setReplyTo(null)}
          phrases={phrases}
          defaultMode={prefs.inputMode as InputMode}
          uploadMode={uploadMode}
          onSent={() => void mutate()}
        />
        </div>
      </div>
      <div className="hidden w-80 shrink-0 overflow-y-auto lg:block">
        {isDirect ? <DirectPanel circle={circle} me={me} /> : <MembersPanel circle={circle} me={me} />}
      </div>
    </div>
  );
}
