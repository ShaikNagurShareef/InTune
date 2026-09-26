"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, Notice, Tag, inputClass } from "@/components/ui";
import type { Draft } from "./types";

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
}

const PLACEHOLDER = /\[[^\]]*\?\]/;

function SavePhrase({ source, meaning }: { source: string; meaning: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" className="min-h-11 text-sm font-bold text-teal underline underline-offset-4" onClick={() => setOpen(true)}>
        Save this meaning to my phrasebook
      </button>
    );
  }
  const save = async (form: FormData) => {
    try {
      await api("/api/v1/phrases", {
        body: {
          phrase: String(form.get("phrase") ?? ""),
          meaning: String(form.get("meaning") ?? ""),
          example: null,
        },
      });
      setStatus("Saved. Next time you use this phrase, InTune can suggest this meaning — you’ll still confirm it.");
      setOpen(false);
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : "Couldn't save.");
    }
  };
  return (
    <form action={save} className="space-y-2 rounded-xl border border-line bg-paper-2 p-3">
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

/** Exact preview of text and audience. Any edit creates a new version, so approval always matches what is shown (FR21). */
export function ReviewPanel({ draft, circleName, memberNames, replyLabel, isSending, sendError, onDraftChange, onApproveAndSend, onBack }: Props) {
  const [text, setText] = useState(draft.text);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assist = draft.assist;
  const flags = [...(assist?.unsupported_additions ?? []), ...(assist?.lost_meaning ?? [])];
  const original = draft.transcript ?? draft.sourceText;
  const isDirty = text !== draft.text;
  const hasPlaceholder = PLACEHOLDER.test(text);
  const needsAck = draft.aiAssisted && flags.length > 0;

  const saveEdit = async (): Promise<Draft | null> => {
    try {
      const next = await api<Draft>(`/api/v1/drafts/${draft.id}`, {
        method: "PATCH",
        body: { expected_version: draft.version, text },
      });
      onDraftChange(next);
      return next;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your edit.");
      return null;
    }
  };

  const useOriginal = async () => {
    try {
      const next = await api<Draft>(`/api/v1/drafts/${draft.id}`, {
        method: "PATCH",
        body: { expected_version: draft.version, use_original: true },
      });
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
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="review-heading" className="font-display text-2xl font-semibold">Check before sending</h3>
        {draft.aiAssisted && <Tag tone="ai">AI-assisted</Tag>}
      </div>

      <p className="rounded-xl bg-paper-2 px-3 py-2">
        <strong>To:</strong> {circleName} · {memberNames.length} {memberNames.length === 1 ? "person" : "people"} ({memberNames.join(", ")})
        {replyLabel && <span className="block text-sm text-ink-2">Replying to {replyLabel}</span>}
      </p>

      <label className="block">
        <span className="mb-1 block font-bold">Your message — exactly as it will be sent</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={2000}
          className={`${inputClass} text-lg`}
          aria-describedby="review-help"
        />
      </label>
      <p id="review-help" className="text-sm text-ink-2">
        Edit anything. Changing the words means you approve the new version.
      </p>

      {hasPlaceholder && (
        <Notice tone="uncertain" title="Something is still missing">
          Replace the part in [brackets?] with what you mean, or remove it.
        </Notice>
      )}
      {assist && assist.uncertain_spans.length > 0 && (
        <Notice tone="uncertain" title="Words InTune wasn’t sure about">
          {assist.uncertain_spans.map((s) => `“${s.text}”`).join(", ")}
        </Notice>
      )}
      {needsAck && (
        <div className="space-y-2 rounded-xl border border-clay/40 bg-clay-soft p-3" role="alert">
          <p className="font-bold">Please check — this may not match what you said:</p>
          <ul className="list-disc pl-5">
            {flags.map((f) => <li key={f}>{f}</li>)}
          </ul>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="h-5 w-5" />
            I’ve checked it, and the message says what I mean.
          </label>
        </div>
      )}
      {assist && assist.used_phrases.length > 0 && (
        <p className="text-sm text-ink-2">
          Used from your phrasebook: {assist.used_phrases.map((p) => `“${p.phrase}” → ${p.meaning}`).join("; ")}
        </p>
      )}

      {draft.aiAssisted && original && (
        <div className="rounded-xl border border-line p-3">
          <p className="text-sm font-bold text-ink-2">Your original words</p>
          <p className="whitespace-pre-wrap">{original}</p>
          {original !== text && (
            <Button tone="ghost" className="mt-1 text-sm" onClick={useOriginal}>Use my original words instead</Button>
          )}
        </div>
      )}

      {(error || sendError) && <Notice tone="warn">{error ?? sendError}</Notice>}

      <div className="flex flex-wrap items-center gap-2">
        <Button tone="primary" onClick={approve} disabled={!canSend}>
          {isSending ? "Sending… not sent yet" : "Approve and send"}
        </Button>
        {isDirty && <Button onClick={() => void saveEdit()}>Save edit</Button>}
        <Button tone="ghost" onClick={onBack}>Back</Button>
      </div>
      {draft.aiAssisted && original && <SavePhrase source={original} meaning={text} />}
    </section>
  );
}
