"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { Crown, Link2, LogOut, Mail, MessageCircle, Trash2, UserMinus, UserPlus, X } from "lucide-react";
import { api, ApiError, fetcher } from "@/lib/client/api";
import { ActionMenu } from "@/components/action-menu";
import { Avatar } from "@/components/avatar";
import { CommCardView, StatusBadge } from "@/components/comm-card";
import { Button, Notice, inputClass } from "@/components/ui";
import type { CircleInfo, Me } from "./types";

interface PendingInvite {
  id: string;
  targetEmail: string | null;
  expiresAt: string;
}

/** Circle details: members (with "how to talk with me"), invitations by email, and owner controls. */
export function MembersPanel({ circle, me }: { circle: CircleInfo; me: Me }) {
  const router = useRouter();
  const isOwner = circle.role === "owner";
  const { data: invites, mutate } = useSWR<{ invites: PendingInvite[] }>(isOwner ? `/api/v1/circles/${circle.id}/invites` : null, fetcher);
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [openCard, setOpenCard] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMessage({ tone: "ok", text: ok });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "warn", text: err instanceof ApiError ? err.message : "That didn't work." });
    }
  };

  const messagePerson = async (userId: string) => {
    try {
      const { id } = await api<{ id: string }>("/api/v1/direct", { body: { user_id: userId } });
      router.push(`/circles/${id}`);
      router.refresh();
    } catch (err) {
      setMessage({ tone: "warn", text: err instanceof ApiError ? err.message : "Couldn't open the chat." });
    }
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "").trim();
    try {
      await api(`/api/v1/circles/${circle.id}/invites`, { body: { target_email: email } });
      form.reset();
      setMessage({
        tone: "ok",
        text: `Invitation sent. If ${email} has an InTune account, it appears in their Requests right away; if they sign up with that email within 24 hours, they'll see it then.`,
      });
      await mutate();
    } catch (err) {
      setMessage({ tone: "warn", text: err instanceof ApiError ? err.message : "Could not send the invitation." });
    }
  };

  const createShareLink = async () => {
    try {
      const res = await api<{ url: string }>(`/api/v1/circles/${circle.id}/invites`, { body: { share_link: true } });
      setLink(res.url);
      await mutate();
    } catch (err) {
      setMessage({ tone: "warn", text: err instanceof ApiError ? err.message : "Could not create the link." });
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link).catch(() => undefined);
    setMessage({ tone: "ok", text: "Link copied. It works once and expires in 24 hours." });
  };

  return (
    <div className="space-y-6 p-5">
      <div className="flex flex-col items-center text-center">
        <Avatar name={circle.name} seed={circle.id} group size="lg" ring />
        <h2 className="mt-3 text-xl font-extrabold">{circle.name}</h2>
        <p className="text-sm text-ink-2">Private circle · {circle.members.length} of 20 members</p>
      </div>

      <section aria-labelledby="members-heading">
        <h3 id="members-heading" className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-2">Who can read this circle</h3>
        <ul className="space-y-1">
          {circle.members.map((m) => (
            <li key={m.id} className="rounded-2xl hover:bg-paper-2/60">
              <div className="flex items-center gap-3 px-1 py-1.5">
                <Avatar name={m.displayName} seed={m.id} size="sm" status={m.status} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-bold">
                    {m.displayName}
                    {m.id === me.id && <span className="text-xs font-semibold text-ink-2">(you)</span>}
                    {m.role === "owner" && <Crown aria-label="owner" className="h-3.5 w-3.5 text-amber-ink" />}
                  </p>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={m.status} />
                    {m.id !== me.id && (m.commCard || m.status !== "none") && (
                      <button
                        type="button"
                        aria-expanded={openCard === m.id}
                        onClick={() => setOpenCard(openCard === m.id ? null : m.id)}
                        className="text-xs font-bold text-teal"
                      >
                        {openCard === m.id ? "Hide" : "How to talk with them"}
                      </button>
                    )}
                  </div>
                </div>
                {m.id !== me.id && (
                  <button
                    type="button"
                    onClick={() => messagePerson(m.id)}
                    aria-label={`Message ${m.displayName}`}
                    title={`Message ${m.displayName}`}
                    className="grid h-10 w-10 place-items-center rounded-full hover:bg-paper-2"
                  >
                    <MessageCircle aria-hidden="true" className="h-5 w-5" />
                  </button>
                )}
                {isOwner && m.id !== me.id && (
                  <ActionMenu
                    label={`Owner actions for ${m.displayName}`}
                    align="right"
                    actions={[
                      {
                        label: "Make owner",
                        icon: Crown,
                        onSelect: () => run(() => api(`/api/v1/circles/${circle.id}/transfer`, { body: { user_id: m.id } }), `${m.displayName} now owns the circle.`),
                      },
                      {
                        label: "Remove from circle",
                        icon: UserMinus,
                        danger: true,
                        onSelect: () => {
                          if (confirm(`Remove ${m.displayName}? They will no longer be able to read new or old posts here.`)) {
                            void run(() => api(`/api/v1/circles/${circle.id}/members/${m.id}`, { method: "DELETE" }), "Removed.");
                          }
                        },
                      },
                    ]}
                  />
                )}
              </div>
              {openCard === m.id && (
                <div className="px-1 pb-2">
                  <CommCardView name={m.displayName} card={m.commCard} status={m.status} />
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-2">Removing someone stops future access. Anything they already saw can’t be un-seen or recalled.</p>
      </section>

      {isOwner && (
        <section aria-labelledby="invite-heading" className="space-y-3">
          <h3 id="invite-heading" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-2">
            <UserPlus aria-hidden="true" className="h-4 w-4" /> Invite someone
          </h3>
          <form onSubmit={handleInvite} className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-sm font-bold">Their email</span>
              <span className="flex items-center gap-2 rounded-xl border border-line bg-paper-2 px-3 focus-within:border-teal">
                <Mail aria-hidden="true" className="h-4 w-4 text-ink-2" />
                <input name="email" type="email" required autoComplete="off" placeholder="name@example.com" className="h-11 min-w-0 flex-1 bg-transparent outline-none" />
              </span>
            </label>
            <button type="submit" className="bg-brand min-h-11 w-full rounded-xl font-bold text-on-brand hover:brightness-110">Send invitation</button>
            <p className="text-xs text-ink-2">They’ll see it in their Requests and choose to join. No search: use the email they signed up with.</p>
          </form>

          {invites && invites.invites.length > 0 && (
            <div>
              <h4 className="text-sm font-bold">Waiting for a reply</h4>
              <ul className="mt-1 space-y-1 text-sm">
                {invites.invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-2">
                    <Mail aria-hidden="true" className="h-4 w-4 text-ink-2" />
                    <span className="min-w-0 flex-1 truncate">{i.targetEmail ?? "Anyone with the link"}</span>
                    <button
                      type="button"
                      aria-label={`Cancel invitation to ${i.targetEmail ?? "link"}`}
                      onClick={() =>
                        run(async () => {
                          await api(`/api/v1/circles/${circle.id}/invites/${i.id}`, { method: "DELETE" });
                          await mutate();
                        }, "Invitation cancelled.")
                      }
                      className="grid h-9 w-9 place-items-center rounded-full hover:bg-paper-2"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-bold text-ink-2">
              <Link2 aria-hidden="true" className="h-4 w-4" /> Not on InTune yet? Use a one-time link
            </summary>
            {link ? (
              <div className="space-y-2">
                <label className="block font-bold" htmlFor="invite-link">One-time link (works once, 24 hours)</label>
                <input id="invite-link" readOnly value={link} className={`${inputClass} text-sm`} onFocus={(e) => e.currentTarget.select()} />
                <Button onClick={copy} className="w-full">Copy link</Button>
              </div>
            ) : (
              <Button onClick={createShareLink} className="w-full">Create a one-time link</Button>
            )}
          </details>
        </section>
      )}

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="border-t border-line pt-4">
        {isOwner ? (
          <button
            type="button"
            onClick={() => {
              if (confirm("Delete this circle for everyone? This cannot be undone.")) {
                void run(async () => {
                  await api(`/api/v1/circles/${circle.id}`, { method: "DELETE" });
                  router.push("/circles");
                }, "Circle deleted.");
              }
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-clay/40 font-bold text-clay hover:bg-clay-soft"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" /> Delete circle
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (confirm("Leave this circle?")) {
                void run(async () => {
                  await api(`/api/v1/circles/${circle.id}/leave`, { method: "POST" });
                  router.push("/circles");
                }, "You left the circle.");
              }
            }}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-clay/40 font-bold text-clay hover:bg-clay-soft"
          >
            <LogOut aria-hidden="true" className="h-4 w-4" /> Leave circle
          </button>
        )}
      </div>
    </div>
  );
}
