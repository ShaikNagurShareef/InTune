"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { Avatar } from "./avatar";

/** Public demo password for the scripted @intune.demo accounts (see scripts/seed-demo.ts). */
const DEMO_PASSWORD = "InTune-demo-2026";

const PERSONAS = [
  { key: "maya", name: "Maya Chen", blurb: "Autistic adult · prefers text · circles with family and a games night" },
  { key: "leo", name: "Leo Park", blurb: "Autistic adult · uses phrases when talking is hard · works with Sam" },
  { key: "priya", name: "Priya Chen", blurb: "Maya’s sister · learning to be more direct" },
  { key: "sam", name: "Sam Rivera", blurb: "Leo’s coworker · often writes indirectly" },
  { key: "guest", name: "Demo Guest", blurb: "New here · has an invitation waiting in Requests" },
];

/** One-click sign-in to scripted demo accounts, clearly labelled as fictional. */
export function DemoAccounts() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (key: string) => {
    setBusy(key);
    setError(null);
    try {
      await api("/api/v1/auth/signin", { body: { email: `${key}@intune.demo`, password: DEMO_PASSWORD } });
      router.push("/circles");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Demo sign-in failed.");
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="demo-h" className="rounded-3xl border border-line bg-card p-5">
      <h2 id="demo-h" className="font-extrabold">Try the demo</h2>
      <p className="mt-1 text-sm text-ink-2">Fictional people with scripted conversations. Open two browsers to chat between them.</p>
      {error && <p role="alert" className="mt-2 text-sm text-clay">{error}</p>}
      <ul className="mt-3 space-y-1">
        {PERSONAS.map((p) => (
          <li key={p.key}>
            <button
              type="button"
              onClick={() => signIn(p.key)}
              disabled={busy !== null}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 text-left transition hover:bg-paper-2 disabled:opacity-60"
            >
              <Avatar name={p.name} seed={p.key} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold">Try as {p.name}</span>
                <span className="block truncate text-xs text-ink-2">{p.blurb}</span>
              </span>
              {busy === p.key ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ArrowRight aria-hidden="true" className="h-4 w-4 text-ink-2" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
