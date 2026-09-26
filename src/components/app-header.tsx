import Link from "next/link";
import { AudioWaveform, LogIn } from "lucide-react";
import { getServerUser } from "@/lib/auth/server-session";
import { isDemoEmail } from "@/lib/demo";
import { getPreferences } from "@/lib/services/accounts";
import { listMyInvitations } from "@/lib/services/invites";
import { PrefsApplier } from "./prefs-applier";
import { SignOutButton } from "./sign-out-button";
import { KeyStatus } from "./key-status";
import { Logo } from "./logo";
import { BottomTabs, SideNav } from "./nav-links";

/**
 * App chrome. Signed in: Instagram-style side rail on desktop, top bar + bottom tabs on phones.
 * Signed out: a slim top bar only.
 */
export async function AppHeader() {
  const user = await getServerUser();
  if (!user) {
    return (
      <header id="app-header" className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="rounded-lg"><Logo /></Link>
          <nav aria-label="Account" className="ml-auto flex items-center gap-2">
            <Link href="/signin" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-bold hover:bg-paper-2">
              <LogIn aria-hidden="true" className="h-5 w-5" /> Sign in
            </Link>
            <Link href="/signup" className="bg-brand inline-flex min-h-11 items-center rounded-xl px-5 font-bold text-on-brand shadow-[var(--shadow)] hover:brightness-110">
              Create account
            </Link>
          </nav>
        </div>
      </header>
    );
  }

  const [prefs, invitations] = await Promise.all([getPreferences(user.id), listMyInvitations(user)]);
  const demo = isDemoEmail(user.email);
  return (
    <>
      <PrefsApplier textSize={prefs.textSize} reduceMotion={prefs.reduceMotion} theme={prefs.theme} />
      {/* Desktop side rail */}
      <aside
        id="app-header"
        className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col gap-6 border-r border-line bg-paper px-3 py-6 md:flex xl:w-[244px]"
      >
        <Link href="/circles" className="px-2">
          <span className="hidden xl:inline"><Logo /></span>
          <span className="xl:hidden" aria-label="InTune home">
            <span aria-hidden="true" className="bg-brand grid h-9 w-9 place-items-center rounded-[30%] text-on-brand">
              <AudioWaveform className="h-5 w-5" strokeWidth={2.4} />
            </span>
          </span>
        </Link>
        <SideNav invitations={invitations.length} />
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="hidden xl:block"><KeyStatus /></div>
          <p className="hidden truncate px-3 text-sm text-ink-2 xl:block">{user.displayName}</p>
          <SignOutButton />
        </div>
      </aside>
      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-paper/95 px-4 backdrop-blur md:hidden">
        <Link href="/circles"><Logo /></Link>
        <span className="ml-auto flex items-center gap-2">
          <KeyStatus />
          <SignOutButton compact />
        </span>
      </header>
      {demo && (
        <p className="flex h-7 items-center justify-center truncate border-b border-amber-ink/20 bg-amber-soft px-4 text-center text-xs font-semibold text-amber-ink md:ml-[76px] xl:ml-[244px] " id="demo-banner">
          <span className="sm:hidden">Demo account · scripted examples</span>
          <span className="hidden sm:inline">Demo account · the people and conversations here are scripted examples, not real users.</span>
        </p>
      )}
      {/* Phone bottom tabs */}
      <div className="fixed inset-x-0 bottom-0 z-30 md:hidden">
        <BottomTabs invitations={invitations.length} />
      </div>
    </>
  );
}
