"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useMediaQuery } from "@/lib/client/media-query";
import useSWR from "swr";
import { ArrowLeft, Info, X } from "lucide-react";
import { fetcher } from "@/lib/client/api";
import { statusInfo } from "@/lib/social";
import { Avatar } from "@/components/avatar";
import type { UploadMode } from "./composer/upload";
import type { InputMode } from "./composer/types";
import { DirectPanel } from "./direct-panel";
import { Feed } from "./feed";
import { MembersPanel } from "./members-panel";
import type { CircleInfo, FeedPage, Me, PhraseLite, ReplyTarget } from "./types";

const POLL_MS = 3000;

// Client-only: the composer restores unsent words from this tab's session storage on first render.
const Composer = dynamic(() => import("./composer/composer").then((m) => m.Composer), {
  ssr: false,
  loading: () => <div className="h-16" aria-hidden="true" />,
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
  const params = useSearchParams();
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [showDetails, setShowDetails] = useState(params.get("details") === "1");
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

  // Wide screens show details inline; smaller ones as an overlay (only one is ever rendered).
  const isWide = useMediaQuery("(min-width: 1280px)");
  useEffect(() => {
    if (!showDetails || isWide) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowDetails(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showDetails, isWide]);
  const isDirect = circle.kind === "direct";
  const other = isDirect ? circle.members.find((m) => m.id !== me.id) : undefined;
  const otherStatus = other ? statusInfo(other.status) : null;
  const subtitle = isDirect
    ? otherStatus && otherStatus.id !== "none"
      ? `${otherStatus.icon} ${otherStatus.label}`
      : "Direct chat · only you two"
    : `Circle · ${circle.members.length} ${circle.members.length === 1 ? "member" : "members"}`;

  const details = isDirect ? <DirectPanel circle={circle} me={me} /> : <MembersPanel circle={circle} me={me} />;

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <section aria-labelledby="thread-h" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-4">
          <Link href="/circles" aria-label="Back to chats" className="grid h-11 w-11 place-items-center rounded-full hover:bg-paper-2 md:hidden">
            <ArrowLeft aria-hidden="true" className="h-6 w-6" />
          </Link>
          <Avatar name={circle.name} seed={other?.id ?? circle.id} group={!isDirect} size="sm" status={other?.status} />
          <div className="min-w-0 flex-1">
            <h1 id="thread-h" className="truncate font-extrabold leading-tight">{circle.name}</h1>
            <p className="truncate text-xs text-ink-2">{subtitle}</p>
          </div>
          <button
            type="button"
            aria-label={showDetails ? "Hide details" : "Show details"}
            aria-expanded={showDetails}
            onClick={() => setShowDetails((v) => !v)}
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-paper-2"
          >
            <Info aria-hidden="true" className="h-6 w-6" strokeWidth={showDetails ? 2.6 : 2} />
          </button>
        </header>
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
        <div className="shrink-0">
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
      </section>

      {showDetails && isWide && (
        <aside aria-label="Details" className="w-[340px] shrink-0 overflow-y-auto border-l border-line">
          {details}
        </aside>
      )}
      {showDetails && !isWide && (
        <>
          <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onMouseDown={() => setShowDetails(false)}>
            <aside
              aria-label="Details"
              onMouseDown={(e) => e.stopPropagation()}
              className="h-full w-full max-w-sm overflow-y-auto bg-paper shadow-[var(--shadow-lg)]"
            >
              <div className="flex h-14 items-center justify-between border-b border-line px-3">
                <h2 className="font-extrabold">Details</h2>
                <button type="button" aria-label="Close details" onClick={() => setShowDetails(false)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-paper-2">
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
              {details}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
