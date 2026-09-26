"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, BookmarkPlus, CircleHelp, Pencil, Send, ShieldCheck, Undo2, Users } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { toneInfo } from "@/lib/social";
import { Button, Notice, Tag, inputClass } from "@/components/ui";
import type { Draft } from "./types";
import { ToneChips } from "./composer-parts";

interface Props {
  draft: Draft;
  circleName: string;
  memberNames: string[];
  replyLabel: string | null;
  isSending: boolean;
  sendError: string | null;
  onDraftChange: (draft: Draft) => void;
  onApproveAndSend: (draft: Draft, acknowledged: boolean) => void;
  onBack: () => void;
  /** "plan": a group plan drafted by AI from the conversation (no "you wrote" source to compare). */
  variant?: "message" | "plan";
}

const PLACEHOLDER = /\[[^\]]*\?\]/;

function SavePhrase({ source, meaning }: { source: string; meaning: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-teal" onClick={() => setOpen(true)}>
        <BookmarkPlus aria-hidden="true" className="h-4 w-4" /> Save this meaning to my phrasebook
      </button>
    );
  }
  const save = async (form: FormData) => {
    try {
      await api("/api/v1/phrases", {
        body: { phrase: String(form.get("phrase") ?? ""), meaning: String(form.get("meaning") ?? ""), example: null },
      });
      setStatus("Saved. Next time you use this phrase, InTune can suggest this meaning — you’ll still confirm it.");
      setOpen(false);
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : "Couldn't save.");
    }
  };
  return (
    <form action={save} className="space-y-2 rounded-2xl bg-paper-2 p-3">
      <label className="block">
        <span className="mb-1 block text-sm font-bold">When I say</span>
        <input name="phrase" defaultValue={source.slice(0, 120)} required maxLength={120} className={inputClass} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-bold">I mean</span>
        <input name="meaning" defaultValue={meaning.slice(0, 500)} required maxLength={500} className={inputClass} />
      </label>
      <div className="flex gap-2">
        <Button tone="primary" type="submit">Save meaning</Button>
        <Button tone="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {status && <p role="status" className="text-sm">{status}</p>}
    </form>
  );
}

/** Exact preview of text, tone and audience. Any edit creates a new version, so approval always matches what is shown (FR21). */
export function ReviewPanel({ draft, circleName, memberNames, replyLabel, isSending, sendError, onDraftChange, onApproveAndSend, onBack, variant = "message" }: Props) {
  const [text, setText] = useState(draft.text);
  const [isEditing, setIsEditing] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assist = draft.assist;
  const flags = [...(assist?.unsupported_additions ?? []), ...(assist?.lost_meaning ?? [])];
  const original = draft.transcript ?? draft.sourceText;
  const isDirty = text !== draft.text;
  const hasPlaceholder = PLACEHOLDER.test(text);
  const needsAck = draft.aiAssisted && flags.length > 0;
  const tags = draft.toneTags.map(toneInfo).filter((t) => t !== undefined);

  const saveEdit = async (): Promise<Draft | null> => {
    try {
      const next = await api<Draft>(`/api/v1/drafts/${draft.id}`, { method: "PATCH", body: { expected_version: draft.version, text } });
      onDraftChange(next);
      return next;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your edit.");
      return null;
    }
  };

  const changeTones = async (toneTags: string[]) => {
    try {
      const next = await api<Draft>(`/api/v1/drafts/${draft.id}`, {
        method: "PATCH",
        body: { expected_version: draft.version, text, tone_tags: toneTags },
      });
      onDraftChange(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change the tone.");
    }
  };

  const useOriginal = async () => {
    try {
      const next = await api<Draft>(`/api/v1/drafts/${draft.id}`, { method: "PATCH", body: { expected_version: draft.version, use_original: true } });
      setText(next.text);
      onDraftChange(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't switch to your words.");
    }
  };

  const approve = async () => {
    const current = isDirty ? await saveEdit() : draft;
    if (current) onApproveAndSend(current, acknowledged);
  };

  const canSend = text.trim().length > 0 && !hasPlaceholder && (!needsAck || acknowledged) && !isSending;

  return (
    <section aria-labelledby="review-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden="true" className="h-5 w-5 text-teal" />
        <h3 id="review-heading" className="text-lg font-extrabold">
          {variant === "plan" ? "Check the plan before posting" : draft.aiAssisted ? "Check the translation" : "Check before sending"}
        </h3>
        {draft.aiAssisted && <Tag tone="ai">AI-assisted</Tag>}
      </div>

      {variant === "message" && draft.aiAssisted && original && (
        <div className="rounded-3xl border border-line p-4">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-ink-2">You wrote</p>
          <p className="font-read whitespace-pre-wrap text-lg">{original}</p>
          <p className="mt-2 flex items-center gap-1 text-xs font-bold text-teal">
            <ArrowDown aria-hidden="true" className="h-4 w-4" /> Translated so others understand it the way you mean it
          </p>
        </div>
      )}

      <p className="flex items-center gap-2 text-sm text-ink-2">
        <Users aria-hidden="true" className="h-4 w-4" />
        <span>
          To <strong className="text-ink">{circleName}</strong> · {memberNames.length} {memberNames.length === 1 ? "person" : "people"} ({memberNames.join(", ")})
          {replyLabel && <> · replying to {replyLabel}</>}
        </span>
      </p>

      {/* What the other person will see, exactly. */}
      <div className="rounded-3xl bg-paper-2 p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-2">They’ll see exactly this</p>
        {isEditing ? (
          <label className="block">
            <span className="sr-only">Your message — exactly as it will be sent</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} className={`${inputClass} font-read text-lg`} autoFocus />
          </label>
        ) : (
          <div className="flex justify-end" data-testid="review-preview">
            <div className={`bg-mine font-read relative max-w-[90%] whitespace-pre-wrap break-words rounded-[22px] rounded-br-md px-4 py-2.5 text-[1.0625rem] text-on-mine ${tags.length ? "mb-3.5" : ""}`}>
              {text}
              {tags.length > 0 && (
                <span className="absolute -bottom-3.5 right-2 flex gap-1">
                  {tags.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line bg-card px-2 py-0.5 font-sans text-[11px] font-bold text-ink">
                      <span aria-hidden="true">{t.icon}</span>
                      {t.label}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button tone="ghost" className="text-sm" onClick={() => setIsEditing((v) => !v)}>
            <Pencil aria-hidden="true" className="h-4 w-4" /> {isEditing ? "Done editing" : "Edit words"}
          </Button>
          {isDirty && <Button className="text-sm" onClick={() => void saveEdit()}>Save edit</Button>}
          {variant === "message" && draft.aiAssisted && original && original !== text && (
            <Button tone="ghost" className="text-sm" onClick={useOriginal}>
              <Undo2 aria-hidden="true" className="h-4 w-4" /> Send my own words instead
            </Button>
          )}
        </div>
      </div>

      <ToneChips value={draft.toneTags} onChange={changeTones} />


      {hasPlaceholder && (
        <Notice tone="uncertain" title="Something is still missing">
          Replace the part in [brackets?] with what you mean, or remove it.
        </Notice>
      )}
      {assist && assist.uncertain_spans.length > 0 && (
        <p className="flex items-start gap-2 rounded-2xl bg-amber-soft px-3 py-2 text-sm text-amber-ink">
          <CircleHelp aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          Words InTune wasn’t sure about: {assist.uncertain_spans.map((s) => `“${s.text}”`).join(", ")}
        </p>
      )}
      {needsAck && (
        <div className="space-y-2 rounded-2xl border border-clay/40 bg-clay-soft p-3" role="alert">
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 text-clay" /> Please check — this may not match what you said:
          </p>
          <ul className="list-disc pl-6 text-sm">
            {flags.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="h-5 w-5" />
            I’ve checked it, and the message says what I mean.
          </label>
        </div>
      )}
      {assist && assist.used_phrases.length > 0 && (
        <p className="text-sm text-ink-2">
          From your phrasebook: {assist.used_phrases.map((p) => `“${p.phrase}” → ${p.meaning}`).join("; ")}
        </p>
      )}

      {(error || sendError) && <Notice tone="warn">{error ?? sendError}</Notice>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button tone="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back
        </Button>
        <button
          type="button"
          onClick={approve}
          disabled={!canSend}
          className="bg-brand ml-auto inline-flex min-h-12 items-center gap-2 rounded-xl px-5 font-extrabold text-on-brand shadow-[var(--shadow)] hover:brightness-110 disabled:opacity-40"
        >
          <Send aria-hidden="true" className="h-4 w-4" />
          {isSending ? "Sending… not sent yet" : variant === "plan" ? "Approve and post" : draft.aiAssisted ? "Approve and send" : "Send"}
        </button>
      </div>
      {variant === "message" && draft.aiAssisted && original && <SavePhrase source={original} meaning={text} />}
    </section>
  );
}
