"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ChatList } from "./chat-list";
import type { ChatSummary, MyInvitation } from "./types";

interface Props {
  me: { id: string; displayName: string };
  initialChats: ChatSummary[];
  initialInvitations: MyInvitation[];
  quiet: boolean;
  status: string;
  children: ReactNode;
}

export function ChatsShell({ children, ...listProps }: Props) {
  const path = usePathname();
  const isThreadOpen = /^\/circles\/[^/]+/.test(path);
  return (
    <div className="flex h-[calc(100dvh-var(--chrome-h)-var(--banner-h))] min-h-0">
      <div
        className={`min-h-0 w-full shrink-0 border-line md:w-[360px] md:border-r lg:w-[400px] ${isThreadOpen ? "hidden md:block" : "block"}`}
      >
        <ChatList {...listProps} />
      </div>
      <div className={`min-h-0 min-w-0 flex-1 ${isThreadOpen ? "flex" : "hidden md:flex"}`}>{children}</div>
    </div>
  );
}
