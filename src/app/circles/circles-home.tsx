"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/client/api";
import { useHasGeminiKey } from "@/lib/client/byok";
import { Button, Notice, inputClass } from "@/components/ui";

interface CircleSummary {
  id: string;
  name: string;
  role: string;
  unread: number;
}

const POLL_MS = 5000;

export function CirclesHome({ initial, quiet, pendingInvites, name }: {
  initial: CircleSummary[];
  quiet: boolean;
  pendingInvites: number;
  name: string;
}) {
  const router = useRouter();
  const hasKey = useHasGeminiKey();
  const { data } = useSWR<{ circles: CircleSummary[] }>("/api/v1/circles", fetcher, {
    fallbackData: { circles: initial },
    refreshInterval: POLL_MS,
  });
  const [error, setError] = useState<string | null>(null);
  const circles = data?.circles ?? initial;

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const circleName = String(new FormData(form).get("name") ?? "");
    try {
      const { id } = await api<{ id: string }>("/api/v1/circles", { body: { name: circleName } });
      form.reset();
      router.push(`/circles/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the circle.");
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="circles-heading">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal">Hello, {name}</p>
        <h1 id="circles-heading" className="font-display mb-6 text-5xl font-semibold">Your circles</h1>
        {pendingInvites > 0 && (
          <div className="mb-6">
            <Notice tone="info" title={`You have ${pendingInvites} invitation${pendingInvites === 1 ? "" : "s"} waiting`}>
              Open the invitation link you were sent to see who is in the circle before you decide.
            </Notice>
          </div>
        )}
        {circles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-card p-8">
            <p className="font-display text-2xl">No circles yet.</p>
            <p className="mt-2 text-ink-2">
              Create one for the people you talk with most — family, a friend, a club. Then share a private invitation link.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)]">
            {circles.map((c) => (
              <li key={c.id}>
                <Link href={`/circles/${c.id}`} className="flex min-h-16 items-center gap-4 px-5 py-4 hover:bg-paper-2">
                  <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-soft font-display text-xl font-semibold text-teal">
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1">
                    <span className="block text-lg font-bold">{c.name}</span>
                    <span className="text-sm text-ink-2">{c.role === "owner" ? "You own this circle" : "Member"}</span>
                  </span>
                  {!quiet && c.unread > 0 && (
                    <span className="rounded-full bg-teal px-3 py-1 text-sm font-bold text-teal-ink">
                      {c.unread} new<span className="sr-only"> messages</span>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="space-y-6">
        <form onSubmit={handleCreate} className="rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow)]">
          <h2 className="font-display text-2xl font-semibold">New circle</h2>
          <p className="mb-4 mt-1 text-sm text-ink-2">Private. Up to 20 people. Only members can read it.</p>
          <label className="block">
            <span className="mb-1 block font-bold">Circle name</span>
            <input name="name" required maxLength={80} placeholder="e.g. Sunday dinner" className={inputClass} />
          </label>
          {error && <div className="mt-3"><Notice tone="warn">{error}</Notice></div>}
          <Button tone="primary" type="submit" className="mt-4 w-full">Create circle</Button>
        </form>
        {!hasKey && (
          <div className="rounded-2xl border border-line bg-paper-2 p-5">
            <h2 className="font-bold">Want wording help?</h2>
            <p className="mt-1 text-sm text-ink-2">
              Add your own Gemini API key. It stays in this browser. You can message without it.
            </p>
            <Link href="/settings" className="mt-3 inline-flex min-h-11 items-center font-bold text-teal underline underline-offset-4">
              Add a key
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
