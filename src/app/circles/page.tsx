import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/server-session";
import { getPreferences } from "@/lib/services/accounts";
import { countInvitesForEmail } from "@/lib/services/invites";
import { listCircles } from "@/lib/services/circles";
import { CirclesHome } from "./circles-home";

export const metadata: Metadata = { title: "Circles" };

export default async function CirclesPage() {
  const user = await requirePageUser("/circles");
  const [prefs, circles, invites] = await Promise.all([
    getPreferences(user.id),
    listCircles(user.id),
    countInvitesForEmail(user.email),
  ]);
  return <CirclesHome initial={circles} quiet={prefs.quietMode} pendingInvites={invites} name={user.displayName} />;
}
