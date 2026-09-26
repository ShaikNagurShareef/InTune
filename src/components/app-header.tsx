import Link from "next/link";
import { getServerUser } from "@/lib/auth/server-session";
import { getPreferences } from "@/lib/services/accounts";
import { listMyInvitations } from "@/lib/services/invites";
import { PrefsApplier } from "./prefs-applier";
import { SignOutButton } from "./sign-out-button";
import { KeyStatus } from "./key-status";

const NAV = [
  { href: "/circles", label: "Chats" },
  { href: "/me", label: "My communication" },
  { href: "/settings", label: "Gemini key" },
];

export async function AppHeader() {
  const user = await getServerUser();
  const prefs = user ? await getPreferences(user.id) : null;
  const invitationCount = user ? (await listMyInvitations(user)).length : 0;
  return (
    <header id="app-header" className="border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      {prefs && <PrefsApplier textSize={prefs.textSize} reduceMotion={prefs.reduceMotion} />}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:py-3">
        <Link href={user ? "/circles" : "/"} className="group flex items-baseline gap-2 rounded-md">
          <span className="font-display text-2xl font-semibold tracking-tight">
            In<span className="text-teal">Tune</span>
          </span>
          <span className="hidden text-xs text-ink-2 sm:inline">say it your way</span>
        </Link>
        {user ? (
          <>
            <nav aria-label="Main" className="order-last -mx-2 flex w-[calc(100%+1rem)] gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto sm:flex-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-3 font-bold text-ink-2 hover:bg-paper-2 hover:text-ink"
                >
                  {item.label}
                  {item.href === "/circles" && invitationCount > 0 && (
                    <span className="ml-1.5 rounded-full bg-teal px-2 text-xs text-teal-ink">
                      {invitationCount}
                      <span className="sr-only"> invitation{invitationCount === 1 ? "" : "s"}</span>
                    </span>
                  )}
                </Link>
              ))}
            </nav>
            <span className="ml-auto flex items-center gap-2">
              <KeyStatus />
              <span className="hidden text-sm text-ink-2 md:inline">{user.displayName}</span>
              <SignOutButton />
            </span>
          </>
        ) : (
          <nav aria-label="Account" className="ml-auto flex gap-2">
            <Link href="/signin" className="inline-flex min-h-11 items-center rounded-lg px-3 font-bold hover:bg-paper-2">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-11 items-center rounded-xl bg-teal px-4 font-bold text-teal-ink shadow-[var(--shadow)]"
            >
              Create account
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
