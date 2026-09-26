import type { ReactNode } from "react";
import { Suspense } from "react";
import { requirePageUser } from "@/lib/auth/server-session";
import { getPreferences } from "@/lib/services/accounts";
import { listCircles } from "@/lib/services/circles";
import { listMyInvitations } from "@/lib/services/invites";
import { ChatsShell } from "./chats-shell";

/** Instagram-Direct-style two-pane layout: chat list stays mounted while conversations change. */
export default async function ChatsLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser("/circles");
  const [prefs, chats, invitations] = await Promise.all([
    getPreferences(user.id),
    listCircles(user.id),
    listMyInvitations(user),
  ]);
  return (
    <Suspense>
      <ChatsShell
        me={{ id: user.id, displayName: user.displayName }}
        initialChats={chats}
        initialInvitations={invitations}
        quiet={prefs.quietMode}
        status={prefs.status}
      >
        {children}
      </ChatsShell>
    </Suspense>
  );
}
