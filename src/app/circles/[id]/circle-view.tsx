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
  const { data, mutate, error } = useSWR<FeedPage>(`/api/v1/circles/${circle.id}/messages`, fetcher, {
    fallbackData: initialPage,
    refreshInterval: POLL_MS,
  });

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <header>
          <Link href="/circles" className="text-sm font-bold text-ink-2 hover:text-ink">← All circles</Link>
          <h1 className="font-display mt-1 text-4xl font-semibold sm:text-5xl">{circle.name}</h1>
          <p className="text-ink-2">Private · {circle.members.length} {circle.members.length === 1 ? "member" : "members"}</p>
        </header>
        {error && (
          <p role="alert" className="rounded-xl bg-clay-soft px-4 py-2">
            You may no longer have access to this circle, or you’re offline. New messages will appear when it’s back.
          </p>
        )}
        <Feed circleId={circle.id} latest={data ?? initialPage} mutate={mutate} audioRate={prefs.audioRate} onReply={setReplyTo} />
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
      <MembersPanel circle={circle} me={me} />
    </div>
  );
}
