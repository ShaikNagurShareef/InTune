import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth/server-session";
import { getPreferences } from "@/lib/services/accounts";
import { listPhrases } from "@/lib/services/phrasebook";
import { listBlocked } from "@/lib/services/moderation";
import { PreferencesForm } from "@/components/preferences-form";
import { PageTitle } from "@/components/ui";
import { Phrasebook } from "./phrasebook";
import { BlockedList, DataControls } from "./data-controls";

export const metadata: Metadata = { title: "My communication" };

export default async function MePage() {
  const user = await requirePageUser("/me");
  const [prefs, phrases, blocked] = await Promise.all([getPreferences(user.id), listPhrases(user.id), listBlocked(user.id)]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle eyebrow={user.displayName} title="My communication">
        Your settings, your phrases and your data. Nothing here is shared with your circles.
      </PageTitle>
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <section aria-labelledby="prefs-h" className="rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow)]">
          <h2 id="prefs-h" className="font-display mb-5 text-2xl font-semibold">Preferences</h2>
          <PreferencesForm initial={prefs} />
        </section>
        <div className="space-y-8">
          <section aria-labelledby="phrases-h" className="rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow)]">
            <h2 id="phrases-h" className="font-display text-2xl font-semibold">Phrasebook</h2>
            <p className="mb-4 mt-1 text-sm text-ink-2">
              Your own expressions and what you mean by them. InTune only suggests a meaning you saved, and you always confirm it.
            </p>
            <Phrasebook
              initial={phrases.map((p) => ({ id: p.id, phrase: p.phrase, meaning: p.meaning, example: p.example, revision: p.revision }))}
            />
          </section>
          <section aria-labelledby="blocked-h" className="rounded-2xl border border-line bg-card p-6">
            <h2 id="blocked-h" className="font-display text-2xl font-semibold">Blocked people</h2>
            <BlockedList initial={blocked} />
          </section>
          <section aria-labelledby="data-h" className="rounded-2xl border border-clay/30 bg-card p-6">
            <h2 id="data-h" className="font-display text-2xl font-semibold">Your data</h2>
            <DataControls />
          </section>
          <p className="flex flex-wrap gap-4 text-sm">
            <Link href="/moderation" className="font-bold text-teal underline underline-offset-4">Reports in circles I own</Link>
            <Link href="/diagnostics" className="font-bold text-teal underline underline-offset-4">Diagnostics</Link>
            <Link href="/about" className="font-bold text-teal underline underline-offset-4">Scope and limits</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
