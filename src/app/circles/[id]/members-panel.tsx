"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { api, ApiError, fetcher } from "@/lib/client/api";
import { Button, Notice, inputClass } from "@/components/ui";
import type { CircleInfo, Me } from "./types";

interface PendingInvite {
  id: string;
  targetEmail: string | null;
  expiresAt: string;
}

export function MembersPanel({ circle, me }: { circle: CircleInfo; me: Me }) {
  const router = useRouter();
  const isOwner = circle.role === "owner";
  const { data: invites, mutate } = useSWR<{ invites: PendingInvite[] }>(
    isOwner ? `/api/v1/circles/${circle.id}/invites` : null,
    fetcher,
  );
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMessage({ tone: "ok", text: ok });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "warn", text: err instanceof ApiError ? err.message : "That didn't work." });
    }
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    try {
      const res = await api<{ url: string }>(`/api/v1/circles/${circle.id}/invites`, {
        body: { target_email: email || null },
      });
      setLink(res.url);
      await mutate();
    } catch (err) {
      setMessage({ tone: "warn", text: err instanceof ApiError ? err.message : "Could not create the invitation." });
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link).catch(() => undefined);
    setMessage({ tone: "ok", text: "Link copied. It works once and expires in 24 hours." });
  };

  return (
    <aside aria-labelledby="members-heading" className="space-y-5">
      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 id="members-heading" className="font-display text-xl font-semibold">
          Who can read this circle
        </h2>
        <ul className="mt-3 space-y-2">
          {circle.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{m.displayName}</span>
              {m.id === me.id && <span className="text-sm text-ink-2">(you)</span>}
              {m.role === "owner" && <span className="text-sm text-teal">owner</span>}
              {isOwner && m.id !== me.id && (
                <span className="ml-auto flex gap-1">
                  <Button
                    tone="ghost"
                    className="text-sm"
                    onClick={() => run(() => api(`/api/v1/circles/${circle.id}/transfer`, { body: { user_id: m.id } }), `${m.displayName} now owns the circle.`)}
                  >
                    Make owner
                  </Button>
                  <Button
                    tone="ghost"
                    className="text-sm text-clay"
                    onClick={() => {
                      if (confirm(`Remove ${m.displayName}? They will no longer be able to read new or old posts here.`)) {
                        void run(() => api(`/api/v1/circles/${circle.id}/members/${m.id}`, { method: "DELETE" }), "Removed.");
                      }
                    }}
                  >
                    Remove
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-2">
          Removing someone stops future access. Anything they already saw can’t be un-seen or recalled.
        </p>
      </section>

      {isOwner && (
        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="font-display text-xl font-semibold">Invite someone</h2>
          <form onSubmit={handleInvite} className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-bold">Their email (recommended)</span>
              <input name="email" type="email" className={inputClass} placeholder="Only this person can use the link" />
            </label>
            <Button tone="primary" type="submit" className="w-full">Create invitation link</Button>
          </form>
          {link && (
            <div className="mt-3 space-y-2">
              <label className="block text-sm font-bold" htmlFor="invite-link">Private link — send it yourself</label>
              <input id="invite-link" readOnly value={link} className={`${inputClass} text-sm`} onFocus={(e) => e.currentTarget.select()} />
              <Button onClick={copy} className="w-full">Copy link</Button>
            </div>
          )}
          {invites && invites.invites.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-bold">Waiting for a reply</h3>
              <ul className="mt-1 space-y-1 text-sm">
                {invites.invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate">{i.targetEmail ?? "Anyone with the link"}</span>
                    <Button
                      tone="ghost"
                      className="text-sm"
                      onClick={() => run(async () => {
                        await api(`/api/v1/circles/${circle.id}/invites/${i.id}`, { method: "DELETE" });
                        await mutate();
                      }, "Invitation cancelled.")}
                    >
                      Cancel
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <section className="flex flex-wrap gap-2">
        {isOwner ? (
          <Button
            tone="danger"
            onClick={() => {
              if (confirm("Delete this circle for everyone? This cannot be undone.")) {
                void run(async () => {
                  await api(`/api/v1/circles/${circle.id}`, { method: "DELETE" });
                  router.push("/circles");
                }, "Circle deleted.");
              }
            }}
          >
            Delete circle
          </Button>
        ) : (
          <Button
            tone="danger"
            onClick={() => {
              if (confirm("Leave this circle?")) {
                void run(async () => {
                  await api(`/api/v1/circles/${circle.id}/leave`, { method: "POST" });
                  router.push("/circles");
                }, "You left the circle.");
              }
            }}
          >
            Leave circle
          </Button>
        )}
      </section>
    </aside>
  );
}
