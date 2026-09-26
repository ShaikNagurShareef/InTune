import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/server-session";

export default async function Landing() {
  if (await getServerUser()) redirect("/circles");
  return (
    <div className="grain">
      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-12 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div>
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-teal">A private circle for everyday plans</p>
          <h1 className="font-display text-5xl font-semibold leading-[1.02] sm:text-6xl lg:text-7xl">
            Say it your way.
            <br />
            <span className="italic text-teal">Send it</span> only when it’s right.
          </h1>
          <p className="mt-6 max-w-xl text-xl text-ink-2">
            Speak, type, tap a phrase or record a short video. InTune helps with wording, asks when something is unclear,
            and never sends anything until you approve the exact words and who sees them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="inline-flex min-h-12 items-center rounded-xl bg-teal px-6 text-lg font-bold text-teal-ink shadow-[var(--shadow)] hover:brightness-110">
              Start a circle
            </Link>
            <Link href="/signin" className="inline-flex min-h-12 items-center rounded-xl border border-line bg-card px-6 text-lg font-bold hover:border-ink-2">
              I have an account
            </Link>
          </div>
          <p className="mt-6 text-sm text-ink-2">
            Wording help uses your own Gemini API key, kept only in your browser. Without a key, everything else still works.
          </p>
        </div>

        <ol aria-label="How a message is made" className="relative space-y-4 lg:pt-6">
          <li className="rotate-[-1deg] rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow)]">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-2">Your words · recorded</p>
            <p className="mt-2 font-display text-2xl">“want come … loud … outside?”</p>
          </li>
          <li className="ml-6 rounded-2xl border border-amber-ink/30 bg-amber-soft p-5 text-amber-ink">
            <p className="text-xs font-bold uppercase tracking-widest">InTune asks, instead of guessing</p>
            <p className="mt-2 text-lg font-bold">Where would you like to sit?</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full border border-amber-ink/40 px-3 py-1 font-bold">Outside</span>
              <span className="rounded-full border border-amber-ink/40 px-3 py-1">Inside</span>
              <span className="rounded-full border border-amber-ink/40 px-3 py-1">Something else</span>
            </div>
          </li>
          <li className="rotate-[0.6deg] rounded-2xl border border-teal/30 bg-teal-soft p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-teal">Draft you can edit</p>
            <p className="mt-2 text-lg">Do you want to come to dinner? It’s loud inside, so can we sit outside?</p>
          </li>
          <li className="ml-10 flex items-center gap-3 rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow)]">
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-sage text-lg font-bold text-paper">✓</span>
            <p>
              <strong>You approved it.</strong> <span className="text-ink-2">Sent to Dinner plans · 3 people</span>
            </p>
          </li>
        </ol>
      </section>

      <section className="border-t border-line bg-paper-2/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-3">
          <div className="md:col-span-1">
            <h2 className="font-display text-3xl font-semibold">What InTune promises</h2>
          </div>
          <dl className="grid gap-8 sm:grid-cols-2 md:col-span-2">
            <div>
              <dt className="text-lg font-bold">You own every message</dt>
              <dd className="mt-1 text-ink-2">Approval is tied to the exact text and audience. Change a word, and you approve again.</dd>
            </div>
            <div>
              <dt className="text-lg font-bold">It asks when unsure</dt>
              <dd className="mt-1 text-ink-2">Missing days, names or a yes/no get one short question, never a plausible guess.</dd>
            </div>
            <div>
              <dt className="text-lg font-bold">Reading help goes both ways</dt>
              <dd className="mt-1 text-ink-2">Tap “Make clearer” on any reply. Only you see the simpler version; the original stays.</dd>
            </div>
            <div>
              <dt className="text-lg font-bold">No diagnosis, no guessing feelings</dt>
              <dd className="mt-1 text-ink-2">InTune is communication support. It doesn’t infer mood, health or intent from how you look or sound.</dd>
            </div>
          </dl>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap gap-4 px-4 py-8 text-sm text-ink-2">
        <Link href="/about" className="underline underline-offset-4 hover:text-ink">Scope and limits</Link>
        <Link href="/benchmarks" className="underline underline-offset-4 hover:text-ink">Evaluation results</Link>
        <span>Built for HackGT 13 · Not a medical device</span>
      </footer>
    </div>
  );
}
