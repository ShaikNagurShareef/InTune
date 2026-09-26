import type { Metadata } from "next";
import Link from "next/link";
import { Ban, BookOpen, ChevronRight, Flag, HeartHandshake, Info, Mail, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { requirePageUser } from "@/lib/auth/server-session";
import { getPreferences } from "@/lib/services/accounts";
import { listCircles } from "@/lib/services/circles";
import { listPhrases } from "@/lib/services/phrasebook";
import { listBlocked } from "@/lib/services/moderation";
import { Avatar } from "@/components/avatar";
import { PreferencesForm } from "@/components/preferences-form";
import { SectionCard } from "@/components/section-card";
import { StatusMenu } from "@/components/status-picker";
import { Phrasebook } from "./phrasebook";
import { CommCardEditor } from "./comm-card-editor";
import { BlockedList, DataControls } from "./data-controls";

export const metadata: Metadata = { title: "Profile" };

export default async function MePage() {
  const user = await requirePageUser("/me");
  const [prefs, phrases, blocked, chats] = await Promise.all([
    getPreferences(user.id),
    listPhrases(user.id),
    listBlocked(user.id),
    listCircles(user.id),
  ]);
  const stats = [
    { label: "circles", value: chats.filter((c) => c.kind === "group").length },
    { label: "phrases", value: phrases.length },
    { label: "blocked", value: blocked.length },
  ];
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="flex flex-col items-center gap-6 border-b border-line pb-8 sm:flex-row sm:items-center sm:gap-10">
        <Avatar name={user.displayName} seed={user.id} size="xl" ring status={prefs.status} />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h1 className="text-2xl font-extrabold">{user.displayName}</h1>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-ink-2 sm:justify-start">
            <Mail aria-hidden="true" className="h-4 w-4" /> {user.email}
          </p>
          <dl className="mt-4 flex justify-center gap-8 sm:justify-start">
            {stats.map((s) => (
              <div key={s.label} className="text-center sm:text-left">
                <dt className="text-sm text-ink-2">{s.label}</dt>
                <dd className="text-xl font-extrabold">{s.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4"><StatusMenu initial={prefs.status} /></div>
        </div>
      </header>

      <div className="mt-8 grid gap-6">
        <SectionCard
          id="card-h"
          icon={HeartHandshake}
          title="How to talk with me"
          description="Tell the people in your circles what helps. Understanding goes both ways — this puts some of the work on them."
        >
          <CommCardEditor initial={(prefs.commCard as { chips: string[]; note: string } | null) ?? null} name={user.displayName} />
        </SectionCard>

        <SectionCard
          id="phrases-h"
          icon={BookOpen}
          title="Phrasebook"
          description="Your own expressions and what you mean by them. InTune only suggests a meaning you saved, and you always confirm it."
        >
          <Phrasebook initial={phrases.map((p) => ({ id: p.id, phrase: p.phrase, meaning: p.meaning, example: p.example, revision: p.revision }))} />
        </SectionCard>

        <SectionCard id="prefs-h" icon={SlidersHorizontal} title="Preferences" description="Reading size, speaking speed, motion and how wording help writes for you.">
          <PreferencesForm initial={prefs} />
        </SectionCard>

        <SectionCard id="blocked-h" icon={Ban} title="Blocked people">
          <BlockedList initial={blocked} />
        </SectionCard>

        <SectionCard id="data-h" icon={ShieldAlert} title="Privacy & data" tone="danger">
          <DataControls />
        </SectionCard>

        <nav aria-label="More" className="overflow-hidden rounded-3xl border border-line bg-card">
          {[
            { href: "/moderation", label: "Reports in circles I own", icon: Flag },
            { href: "/about", label: "Scope, limits and privacy", icon: Info },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="flex min-h-14 items-center gap-3 border-b border-line px-5 font-semibold last:border-0 hover:bg-paper-2">
              <l.icon aria-hidden="true" className="h-5 w-5 text-ink-2" />
              <span className="flex-1">{l.label}</span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 text-ink-2" />
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
