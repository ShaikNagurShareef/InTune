import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircleHeart } from "lucide-react";

export const metadata: Metadata = { title: "Chats" };

/** Desktop empty state for the conversation pane (phones show the list instead). */
export default function ChatsPage() {
  return (
    <div className="grid flex-1 place-items-center p-8 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid h-24 w-24 place-items-center rounded-full border-2 border-ink">
          <MessageCircleHeart aria-hidden="true" className="h-12 w-12" strokeWidth={1.5} />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold">Your messages</h1>
        <p className="mt-1 text-ink-2">Say it your way. Nothing is sent until you approve the exact words.</p>
        <Link
          href="/circles?new=1"
          className="bg-brand mt-5 inline-flex min-h-11 items-center rounded-xl px-5 font-bold text-on-brand shadow-[var(--shadow)] hover:brightness-110"
        >
          Send a message
        </Link>
      </div>
    </div>
  );
}
