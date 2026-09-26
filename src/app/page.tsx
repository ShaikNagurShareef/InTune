import Link from "next/link";
import { redirect } from "next/navigation";
import { BatteryLow, HeartHandshake, Languages, Lightbulb, Lock, MessageCircleQuestion, ShieldCheck, Smile, Sparkles } from "lucide-react";
import { getServerUser } from "@/lib/auth/server-session";
import { DemoAccounts } from "@/components/demo-accounts";
import { PhoneMock } from "@/components/phone-mock";

const FEATURES = [
  { icon: Languages, title: "AI translation, both ways", body: "Write, speak or tap phrases your way — ✨ Translate turns it into a clear message. Incoming messages can be translated into plain words for you." },
  { icon: ShieldCheck, title: "You approve every word", body: "Nothing is sent until you approve the exact text, tone and audience. Change a word, approve again." },
  { icon: MessageCircleQuestion, title: "It asks instead of guessing", body: "A missing day or an unclear yes/no gets one short question — never a plausible guess." },
  { icon: Lightbulb, title: "What are they asking?", body: "Each translation shows what’s being asked, whether a reply is needed, and what’s unclear — private to you, never guessing feelings." },
  { icon: Smile, title: "Say the tone out loud", body: "Tag a message “not upset”, “no rush” or “no reply needed” so nobody has to read between the lines." },
  { icon: BatteryLow, title: "Energy status", body: "“Low energy” or “replies may be slow” explains silence without another message to write." },
  { icon: HeartHandshake, title: "How to talk with me", body: "A short card your circles see: “Ask me direct questions. Give me time.” Understanding goes both ways." },
];

export default async function Landing() {
  if (await getServerUser()) redirect("/circles");
  return (
    <div>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
        <div>
          <p className="bg-brand-soft inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold text-teal">
            <Sparkles aria-hidden="true" className="h-4 w-4" /> Messaging for people who communicate differently
          </p>
          <h1 className="mt-5 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Say it your way.
            <br />
            <span className="text-brand">Send it only when it’s right.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-2">
            An AI translator for autistic communication. Say it your way — type, tap phrases, speak or record — and InTune translates
            it into a clear message for your circle, and their replies back into plain words for you. Nothing is sent until you approve it.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="bg-brand inline-flex min-h-12 items-center rounded-xl px-6 text-lg font-bold text-white shadow-[var(--shadow)] hover:brightness-110">
              Create your circle
            </Link>
            <Link href="/signin" className="inline-flex min-h-12 items-center rounded-xl border border-line px-6 text-lg font-bold hover:bg-paper-2">
              Sign in
            </Link>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-ink-2">
            <Lock aria-hidden="true" className="h-4 w-4" /> Private circles only. No diagnosis, no guessing feelings, no public profiles.
          </p>
        </div>
        <PhoneMock />
      </section>

      <section className="border-y border-line bg-paper-2/60">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight">Designed with autistic communication in mind — and for everyone they talk with.</h2>
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-3xl border border-line bg-card p-6 shadow-[var(--shadow)]">
                <span className="bg-brand grid h-11 w-11 place-items-center rounded-2xl text-white">
                  <f.icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-extrabold">{f.title}</h3>
                <p className="mt-1 text-ink-2">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1fr_420px]">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">See it in real conversations</h2>
          <p className="mt-2 text-ink-2">The demo includes fictional adults in everyday situations:</p>
          <dl className="mt-6 space-y-5">
            <div>
              <dt className="font-extrabold">Autistic ↔ autistic</dt>
              <dd className="text-ink-2">Maya, Leo and Jordan plan a board-game night: exact times, dim lights, “leaving early is OK”. Leo uses “red light / green light” phrases when talking is hard.</dd>
            </div>
            <div>
              <dt className="font-extrabold">Autistic ↔ family</dt>
              <dd className="text-ink-2">Mom writes “we should probably do something… maybe?”. Maya asks “Can you say that more directly?” — and Priya learns to add “no reply needed”.</dd>
            </div>
            <div>
              <dt className="font-extrabold">Autistic ↔ coworker</dt>
              <dd className="text-ink-2">Sam asks for a deck “ready-ish by Thursday”. Leo checks: full deck? what time? — and gets a clear deadline.</dd>
            </div>
          </dl>
        </div>
        <DemoAccounts />
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-8 text-sm text-ink-2">
          <Link href="/about" className="hover:text-ink">Scope and limits</Link>
          <Link href="/benchmarks" className="hover:text-ink">Evaluation</Link>
          <span>Built for HackGT 13 · Communication support, not a medical device · No diagnosis, ever</span>
        </div>
      </footer>
    </div>
  );
}
