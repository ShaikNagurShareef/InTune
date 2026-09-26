"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, newIdempotencyKey } from "@/lib/client/api";
import { setMediaConsent, useHasGeminiKey, useMediaConsent } from "@/lib/client/byok";
import { Button, Notice, inputClass } from "@/components/ui";
import type { CircleInfo, Me, PhraseLite, ReplyTarget } from "../types";
import { Recorder, type Capture } from "./recorder";
import { ReviewPanel } from "./review-panel";
import { SymbolBoard } from "./symbol-board";
import { uploadCapture, type UploadMode } from "./upload";
import type { Draft, InputMode, JobView, Pending, WordingMode } from "./types";

type Stage = "compose" | "processing" | "transcript" | "clarify" | "review";

interface Props {
  circle: CircleInfo;
  me: Me;
  replyTo: ReplyTarget | null;
  onClearReply: () => void;
  phrases: PhraseLite[];
  defaultMode: InputMode;
  uploadMode: UploadMode;
  onSent: () => void;
}

const MODES: { value: InputMode; label: string }[] = [
  { value: "type", label: "Type" },
  { value: "symbols", label: "Phrases" },
  { value: "speak", label: "Speak" },
  { value: "video", label: "Video" },
];
const WORDING: { value: WordingMode; label: string }[] = [
  { value: "keep", label: "Keep my wording" },
  { value: "clearer", label: "Make clearer" },
  { value: "shorter", label: "Make shorter" },
];
const JOB_POLL_MS = 1000;
const MANUAL_REASONS: Record<string, string> = {
  no_speech: "InTune couldn’t hear clear words — only silence or background sound. Try again, or type or tap phrases.",
  multiple_speakers: "It sounds like more than one person was talking. Please record just your words, or type instead.",
};

const storageKey = (circleId: string) => `intune.compose.${circleId}`;

function readSaved(circleId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(storageKey(circleId)) ?? "";
  } catch {
    return "";
  }
}

function describe(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") return "Cancelled. Your words are kept.";
  return err instanceof ApiError ? err.message : "Something went wrong. Your words are kept.";
}

export function Composer({ circle, me, replyTo, onClearReply, phrases, defaultMode, uploadMode, onSent }: Props) {
  const hasKey = useHasGeminiKey();
  const [mode, setMode] = useState<InputMode>(defaultMode);
  const [text, setText] = useState(() => readSaved(circle.id));
  const [history, setHistory] = useState<string[]>([]);
  const [capture, setCapture] = useState<Capture | null>(null);
  const consent = useMediaConsent();
  const [wording, setWording] = useState<WordingMode>("clearer");
  const [stage, setStage] = useState<Stage>("compose");
  const [stageLabel, setStageLabel] = useState("Starting");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [job, setJob] = useState<JobView | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [transcriptEdit, setTranscriptEdit] = useState("");
  const [otherAnswer, setOtherAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendKeys = useRef(new Map<string, string>());
  const approvals = useRef(new Map<string, string>());

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey(circle.id), text);
    } catch {
      // Session storage unavailable; the draft simply isn't remembered across reloads.
    }
  }, [circle.id, text]);

  // While a request runs, poll the job's stage label so progress is visible and Cancel has a target.
  useEffect(() => {
    if (stage !== "processing" || !draft) return;
    const id = window.setInterval(async () => {
      const latest = await api<JobView | null>(`/api/v1/drafts/${draft.id}/job`).catch(() => null);
      if (latest) {
        setJob(latest);
        setStageLabel(latest.stage);
      }
    }, JOB_POLL_MS);
    return () => window.clearInterval(id);
  }, [stage, draft]);

  const memberNames = circle.members.map((m) => (m.id === me.id ? "you" : m.displayName));
  const isMedia = mode === "speak" || mode === "video";

  const keyFor = (scope: string) => {
    const existing = sendKeys.current.get(scope);
    if (existing) return existing;
    const key = newIdempotencyKey();
    sendKeys.current.set(scope, key);
    return key;
  };

  const resetAll = () => {
    setStage("compose");
    setDraft(null);
    setJob(null);
    setPending(null);
    setText("");
    setHistory([]);
    setCapture(null);
    setError(null);
    setSendError(null);
    setOtherAnswer(null);
    onClearReply();
  };

  const handleJob = async (next: JobView, current: Draft, signal: AbortSignal) => {
    if (signal.aborted) return;
    setJob(next);
    if (next.status === "REVIEW_READY") {
      const fresh = await api<Draft>(`/api/v1/drafts/${current.id}`, { signal });
      if (signal.aborted) return;
      setDraft(fresh);
      setStage("review");
      return;
    }
    if (next.status === "NEEDS_CLARIFICATION" && next.pending) {
      setPending(next.pending);
      setOtherAnswer(null);
      if (next.pending.kind === "transcript") {
        setTranscriptEdit(next.pending.transcript);
        setStage("transcript");
      } else {
        setStage("clarify");
      }
      return;
    }
    setError(MANUAL_REASONS[next.errorCode ?? ""] ?? "Wording help stopped. Your words are kept — you can send them yourself.");
    setStage("compose");
  };

  const run = async (
    current: Draft,
    call: (signal: AbortSignal) => Promise<JobView>,
    controller = new AbortController(),
  ) => {
    abortRef.current = controller;
    setStage("processing");
    setError(null);
    try {
      await handleJob(await call(controller.signal), current, controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(describe(err));
        setStage("compose");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const startAssist = async () => {
    setError(null);
    setSentNote(null);
    setJob(null);
    // One controller covers upload, draft setup and the assist call, so Cancel works at every step.
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    setStage("processing");
    setStageLabel(isMedia ? "Uploading privately" : "Starting");
    try {
      let created = await api<Draft>("/api/v1/drafts", {
        body: { circle_id: circle.id, reply_to_id: replyTo?.id ?? null, source_mode: mode, source_text: isMedia ? "" : text },
        signal,
      });
      if (isMedia) {
        if (!capture) throw new Error("no recording");
        const mediaId = await uploadCapture(capture, me.id, uploadMode, signal);
        if (signal.aborted) return;
        created = await api<Draft>(`/api/v1/drafts/${created.id}`, {
          method: "PATCH",
          body: { expected_version: created.version, media_id: mediaId },
          signal,
        });
      }
      if (signal.aborted) return;
      setDraft(created);
      await run(
        created,
        (s) =>
          api<JobView>(`/api/v1/drafts/${created.id}/assist`, {
            body: { expected_version: created.version, wording_mode: wording },
            gemini: true,
            signal: s,
          }),
        controller,
      );
    } catch (err) {
      if (signal.aborted) return;
      setError(describe(err));
      setStage("compose");
    }
  };

  const resume = (body: { answer?: string; transcript?: string; wording_mode?: WordingMode }) => {
    if (!draft || !job) return;
    void run(draft, (signal) => api<JobView>(`/api/v1/jobs/${job.id}/clarify`, { body, gemini: true, signal }));
  };

  const cancelJob = async () => {
    abortRef.current?.abort();
    if (job) await api(`/api/v1/jobs/${job.id}/cancel`, { method: "POST" }).catch(() => undefined);
  };

  const cancel = async () => {
    await cancelJob();
    setStage("compose");
    setPending(null);
  };

  /** "Use these words" / "I'll edit it myself": leave the AI flow and review exactly what is there. */
  const reviewManually = async (overrideText?: string) => {
    if (!draft) return;
    await cancelJob();
    try {
      let latest = await api<Draft>(`/api/v1/drafts/${draft.id}`);
      if (overrideText !== undefined) {
        latest = await api<Draft>(`/api/v1/drafts/${draft.id}`, {
          method: "PATCH",
          body: { expected_version: latest.version, text: overrideText, transcript: overrideText },
        });
      }
      setDraft(latest);
      setStage("review");
    } catch (err) {
      setError(describe(err));
    }
  };

  const approveAndSend = async (current: Draft, acknowledged: boolean) => {
    setIsSending(true);
    setSendError(null);
    try {
      // A retry after a lost response must reuse the same approval and key, so the server replays one message.
      const scope = `${current.id}:${current.version}`;
      let approvalId = approvals.current.get(scope);
      if (!approvalId) {
        const approval = await api<{ approval_id: string }>(`/api/v1/drafts/${current.id}/approve`, {
          body: { expected_version: current.version, previewed_text: current.text, acknowledged_flags: acknowledged },
        });
        approvalId = approval.approval_id;
        approvals.current.set(scope, approvalId);
      }
      await api(`/api/v1/messages`, {
        body: {
          circle_id: circle.id,
          text: current.text,
          reply_to_id: current.replyToId,
          draft_id: current.id,
          approval_id: current.aiAssisted ? approvalId : null,
        },
        idempotencyKey: keyFor(scope),
      });
      resetAll();
      setSentNote("Sent.");
      onSent();
    } catch (err) {
      setSendError(`Not sent. ${describe(err)}`);
      if (err instanceof ApiError && err.code === "stale_version") {
        approvals.current.delete(`${current.id}:${current.version}`);
        sendKeys.current.delete(`${current.id}:${current.version}`);
        setDraft(await api<Draft>(`/api/v1/drafts/${current.id}`).catch(() => current));
      }
    } finally {
      setIsSending(false);
    }
  };

  const sendManual = async () => {
    setIsSending(true);
    setSendError(null);
    setSentNote(null);
    const scope = `manual:${replyTo?.id ?? ""}:${text}`;
    try {
      await api("/api/v1/messages", {
        body: { circle_id: circle.id, text, reply_to_id: replyTo?.id ?? null, draft_id: null, approval_id: null },
        idempotencyKey: keyFor(scope),
      });
      // The key only protects retries of this send; the same words sent later are a new message.
      sendKeys.current.delete(scope);
      resetAll();
      setSentNote("Sent.");
      onSent();
    } catch (err) {
      setSendError(`Not sent. ${describe(err)}`);
    } finally {
      setIsSending(false);
    }
  };

  const pickPhrase = (label: string) => {
    setHistory((h) => [...h, text]);
    setText((t) => (t.trim() ? `${t.trimEnd()} ${label}` : label));
  };

  const undo = () => {
    setHistory((h) => {
      const prev = h.at(-1);
      if (prev !== undefined) setText(prev);
      return h.slice(0, -1);
    });
  };

  const needsKeyNotice = !hasKey && (
    <p className="text-sm text-ink-2">
      Wording help is off on this device ·{" "}
      <Link href="/settings" className="font-bold text-teal underline underline-offset-2">add your Gemini key</Link>
    </p>
  );

  return (
    <section aria-labelledby="composer-heading" className="rounded-2xl border border-line bg-card p-3 shadow-[var(--shadow)]">
      <h2 id="composer-heading" className="sr-only">Write a message</h2>
      {replyTo && stage === "compose" && (
        <p className="mb-3 flex items-center gap-2 rounded-lg bg-paper-2 px-3 py-2 text-sm">
          <span className="flex-1">Replying to {replyTo.senderName}: “{replyTo.snippet}”</span>
          <Button tone="ghost" className="text-sm" onClick={onClearReply}>✕ Not a reply</Button>
        </p>
      )}
      {sentNote && stage === "compose" && <p role="status" className="mb-3 font-bold text-sage">✓ {sentNote}</p>}
      {error && <div className="mb-3"><Notice tone="warn">{error}</Notice></div>}

      {stage === "compose" && (
        <div className="space-y-3">
          <div role="radiogroup" aria-label="How do you want to say it?" className="flex gap-1 rounded-xl bg-paper-2 p-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => {
                  setMode(m.value);
                  setCapture(null);
                }}
                className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-bold ${mode === m.value ? "bg-card shadow-[var(--shadow)]" : "text-ink-2 hover:text-ink"}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "symbols" && <SymbolBoard phrases={phrases} onPick={pickPhrase} />}

          {!isMedia && (
            <div>
              <label htmlFor="compose-text" className="mb-1 block text-sm font-bold">
                {mode === "symbols" ? "Your message (you can edit it)" : "Your message"}
              </label>
              <textarea
                id="compose-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Say it however it comes. You can get help with wording."
                className={`${inputClass} text-lg`}
              />
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                <span>{text.length}/2000</span>
                {mode === "symbols" && (
                  <>
                    <Button tone="ghost" className="text-sm" onClick={undo} disabled={!history.length}>Undo</Button>
                    <Button tone="ghost" className="text-sm" onClick={() => { setHistory((h) => [...h, text]); setText(""); }} disabled={!text}>Clear</Button>
                  </>
                )}
              </div>
            </div>
          )}

          {isMedia && (
            hasKey ? (
              <div className="space-y-3">
                <Recorder
                  key={mode}
                  kind={mode === "speak" ? "audio" : "video"}
                  onCapture={setCapture}
                  onPermissionDenied={() => setMode("type")}
                />
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setMediaConsent(e.target.checked)}
                    className="mt-1 h-5 w-5"
                  />
                  <span>
                    I understand my recording is sent to Google Gemini with my key to turn it into words. InTune deletes the
                    recording after processing and never shares it with the circle.
                  </span>
                </label>
              </div>
            ) : (
              needsKeyNotice
            )
          )}

          <div className="flex flex-wrap items-end gap-2">
            {hasKey && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">Wording help</span>
                  <select value={wording} onChange={(e) => setWording(e.target.value as WordingMode)} className={`${inputClass} w-auto`}>
                    {WORDING.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                </label>
                <Button
                  tone="primary"
                  onClick={startAssist}
                  disabled={isMedia ? !capture || !consent : !text.trim()}
                >
                  {isMedia ? "Turn into words" : "Help me word it"}
                </Button>
              </div>
            )}
            {!isMedia && (
              <Button tone={hasKey ? "quiet" : "primary"} onClick={sendManual} disabled={!text.trim() || isSending}>
                {isSending ? "Sending… not sent yet" : "Send my own words"}
              </Button>
            )}
          </div>
          {!isMedia && !hasKey && needsKeyNotice}
          {!isMedia && (
            <p className="truncate text-xs text-ink-2">
              To: {circle.name} · {memberNames.join(", ")}
            </p>
          )}
          {sendError && <Notice tone="warn">{sendError} <button className="font-bold underline" onClick={sendManual}>Retry</button></Notice>}
        </div>
      )}

      {stage === "processing" && (
        <div className="space-y-3" role="status" aria-live="polite">
          <p className="flex items-center gap-3 text-lg font-bold">
            <span aria-hidden="true" className="h-3 w-3 animate-pulse rounded-full bg-teal" />
            {stageLabel}…
          </p>
          {!isMedia && text && <p className="text-ink-2">Your words: “{text}”</p>}
          <Button onClick={cancel}>Cancel</Button>
        </div>
      )}

      {stage === "transcript" && pending?.kind === "transcript" && (
        <div className="space-y-3">
          <h3 className="font-display text-2xl font-semibold">Is this what you said?</h3>
          <label className="block">
            <span className="mb-1 block font-bold">Words from your recording — fix anything that’s wrong</span>
            <textarea value={transcriptEdit} onChange={(e) => setTranscriptEdit(e.target.value)} rows={3} maxLength={2000} className={`${inputClass} text-lg`} />
          </label>
          {pending.uncertainSpans.length > 0 && (
            <Notice tone="uncertain" title="Not sure about">
              {pending.uncertainSpans.map((s) => `“${s.text}”`).join(", ")}
            </Notice>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-sm font-bold">Wording help</span>
              <select value={wording} onChange={(e) => setWording(e.target.value as WordingMode)} className={`${inputClass} w-auto`}>
                {WORDING.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </label>
            <Button tone="primary" disabled={!transcriptEdit.trim()} onClick={() => resume({ transcript: transcriptEdit, wording_mode: wording })}>
              Help me word it
            </Button>
            <Button disabled={!transcriptEdit.trim()} onClick={() => reviewManually(transcriptEdit)}>Use these words</Button>
            <Button tone="ghost" onClick={cancel}>Record again</Button>
          </div>
        </div>
      )}

      {stage === "clarify" && pending?.kind === "clarify" && (
        <div className="space-y-4">
          <p className="text-sm font-bold uppercase tracking-wider text-amber-ink">One question, so nothing is guessed</p>
          <h3 className="font-display text-2xl font-semibold">{pending.question}</h3>
          <div className="flex flex-wrap gap-2">
            {pending.choices.map((c) => (
              <Button key={c} onClick={() => resume({ answer: c })}>{c}</Button>
            ))}
            <Button tone="ghost" onClick={() => setOtherAnswer("")}>Something else</Button>
          </div>
          {otherAnswer !== null && (
            <form
              onSubmit={(e) => { e.preventDefault(); if (otherAnswer.trim()) resume({ answer: otherAnswer }); }}
              className="flex flex-wrap gap-2"
            >
              <label className="sr-only" htmlFor="other-answer">Your answer</label>
              <input id="other-answer" value={otherAnswer} onChange={(e) => setOtherAnswer(e.target.value)} maxLength={300} className={`${inputClass} flex-1`} autoFocus />
              <Button tone="primary" type="submit" disabled={!otherAnswer.trim()}>Answer</Button>
            </form>
          )}
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Button tone="ghost" onClick={() => reviewManually()}>I’ll edit it myself</Button>
            <Button tone="ghost" onClick={cancel}>Cancel</Button>
          </div>
        </div>
      )}

      {stage === "review" && draft && (
        <ReviewPanel
          key={draft.id}
          draft={draft}
          circleName={circle.name}
          memberNames={memberNames}
          replyLabel={draft.replyToId ? (replyTo?.id === draft.replyToId ? replyTo.senderName : "an earlier message") : null}
          isSending={isSending}
          sendError={sendError}
          onDraftChange={setDraft}
          onApproveAndSend={approveAndSend}
          onBack={() => { setStage("compose"); if (!isMedia) setText(draft.sourceText || text); }}
        />
      )}
    </section>
  );
}
