import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadActiveUser, type SessionUser } from "./current-user";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** Server components: resolve the signed-in user, or null. */
export async function getServerUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return loadActiveUser(await verifySessionToken(store.get(SESSION_COOKIE)?.value));
}

/** Page guard: signed-out visitors go to sign-in and come back afterwards. */
export async function requirePageUser(returnTo: string): Promise<SessionUser> {
  const user = await getServerUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(returnTo)}`);
  return user;
}
