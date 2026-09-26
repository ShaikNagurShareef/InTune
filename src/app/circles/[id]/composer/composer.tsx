"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, newIdempotencyKey } from "@/lib/client/api";
import { setMediaConsent, useHasGeminiKey, useMediaConsent } from "@/lib/client/byok";
import { CheckCircle2, CircleHelp, Eraser, FileAudio, LayoutGrid, Loader2, Mic, Pencil, Reply, Sparkles, Undo2, Video, X } from "lucide-react";
import { Button, Notice, inputClass } from "@/components/ui";
import type { CircleInfo, Me, PhraseLite, ReplyTarget } from "../types";
import { Recorder, type Capture } from "./recorder";
import { ReviewPanel } from "./review-panel";
import { SymbolBoard } from "./symbol-board";
import { ChosenTones, ModeBar, QuickReplies, TonePicker, WordingMenu } from "./composer-parts";
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

const JOB_POLL_MS = 1000;
const MANUAL_REASONS: Record<string, string> = {
  no_speech: "InTune couldn’t hear clear words — only silence or background sound. Try again, or type or tap phrases.",
  multiple_speakers: "It sounds like more than one person was talking. Please record just your words, or type instead.",
};

const storageKey = (circleId: string) => `intune.compose.${circleId}`;
const WORDING_KEY = "intune.wording";

/** "Keep my wording" by default: help should never nudge people into masking their own voice. */
function readWording(): WordingMode {
  if (typeof window === "undefined") return "keep";
  try {
    const saved = window.localStorage.getItem(WORDING_KEY);
    return saved === "clearer" || saved === "shorter" ? saved : "keep";
  } catch {
    return "keep";
  }
}

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
  const [wording, setWording] = useState<WordingMode>(readWording);
  const [tones, setTones] = useState<string[]>([]);
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
    setTones([]);
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

  const startAssist = async (chosen: WordingMode = wording) => {
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
        body: {
          circle_id: circle.id,
          reply_to_id: replyTo?.id ?? null,
          source_mode: mode,
          source_text: isMedia ? "" : text,
          tone_tags: tones,
        },
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
            body: { expected_version: created.version, wording_mode: chosen },
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
          tone_tags: current.toneTags,
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
    const scope = `manual:${replyTo?.id ?? ""}:${tones.join(",")}:${text}`;
    try {
      await api("/api/v1/messages", {
        body: {
          circle_id: circle.id,
          text,
          reply_to_id: replyTo?.id ?? null,
          draft_id: null,
          approval_id: null,
          tone_tags: tones,
        },
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

  const switchMode = (next: InputMode) => {
    setMode(next);
    setCapture(null);
  };

  const chooseWording = (next: WordingMode) => {
    setWording(next);
    try {
      window.localStorage.setItem(WORDING_KEY, next);
    } catch {
      // Not remembered; the choice still applies now.
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
    <span>
      AI help is off ·{" "}
      <Link href="/settings" className="font-bold text-teal underline underline-offset-2">add your Gemini key</Link>
    </span>
  );

  const startWith = (next: WordingMode) => {
    chooseWording(next);
    void startAssist(next);
  };
  const cardClass = "rounded-3xl border border-line bg-card p-4 shadow-[var(--shadow)]";

  return (
    <section aria-labelledby="composer-heading" className="border-t border-line bg-paper px-2 pb-2 pt-2 sm:px-4 sm:pb-3">
      <h2 id="composer-heading" className="sr-only">Write a message</h2>
      {error && <div className="mb-2"><Notice tone="warn">{error}</Notice></div>}
      {sentNote && stage === "compose" && (
        <p role="status" className="mb-1 flex items-center gap-1 px-2 text-xs font-bold text-sage">
          <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> {sentNote}
        </p>
      )}

      {stage === "compose" && (
        <div className="space-y-2">
          {replyTo && (
            <div className="flex items-center gap-2 rounded-2xl bg-paper-2 px-3 py-2 text-sm">
              <Reply aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-2" />
              <span className="min-w-0 flex-1 truncate">
                Replying to <strong>{replyTo.senderName}</strong>: {replyTo.snippet}
              </span>
              <button type="button" onClick={onClearReply} aria-label="Not a reply" className="grid h-9 w-9 place-items-center rounded-full hover:bg-paper">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          )}

          {mode === "symbols" && (
            <div className={cardClass}>
              <div className="mb-3 flex items-center gap-2">
                <LayoutGrid aria-hidden="true" className="h-4 w-4" />
                <h3 className="font-extrabold">Phrases</h3>
                <span className="text-xs text-ink-2">Tap to add. You can edit before sending.</span>
                <button type="button" onClick={() => switchMode("type")} aria-label="Close phrases" className="ml-auto grid h-9 w-9 place-items-center rounded-full hover:bg-paper-2">
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <SymbolBoard phrases={phrases} onPick={pickPhrase} />
              <div className="mt-2 flex gap-2">
                <Button tone="ghost" className="text-sm" onClick={undo} disabled={!history.length}><Undo2 aria-hidden="true" className="h-4 w-4" /> Undo</Button>
                <Button tone="ghost" className="text-sm" onClick={() => { setHistory((h) => [...h, text]); setText(""); }} disabled={!text}><Eraser aria-hidden="true" className="h-4 w-4" /> Clear</Button>
              </div>
            </div>
          )}

          {isMedia && (
            <div className={cardClass}>
              <div className="mb-3 flex items-center gap-2">
                {mode === "speak" ? <Mic aria-hidden="true" className="h-4 w-4" /> : <Video aria-hidden="true" className="h-4 w-4" />}
                <h3 className="font-extrabold">{mode === "speak" ? "Voice message" : "Video message"}</h3>
                <button type="button" onClick={() => switchMode("type")} aria-label="Back to typing" className="ml-auto grid h-9 w-9 place-items-center rounded-full hover:bg-paper-2">
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              {hasKey ? (
                <div className="space-y-3">
                  <Recorder key={mode} kind={mode === "speak" ? "audio" : "video"} onCapture={setCapture} onPermissionDenied={() => switchMode("type")} />
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={consent} onChange={(e) => setMediaConsent(e.target.checked)} className="mt-1 h-5 w-5" />
                    <span>My recording is sent to Google Gemini with my key to turn it into words. InTune deletes it afterwards and never shares it with the circle.</span>
                  </label>
                  <WordingMenu current={wording} onPick={startWith} disabled={!capture || !consent} label="Turn into words" primary />
                </div>
              ) : (
                needsKeyNotice
              )}
            </div>
          )}

          {!isMedia && !text && <QuickReplies phrases={phrases} onPick={pickPhrase} />}
          {tones.length > 0 && <ChosenTones value={tones} onChange={setTones} />}

          {!isMedia && (
            <div className="flex items-end gap-1 rounded-[28px] border border-line bg-paper py-1 pl-1 pr-2 transition focus-within:border-ink-2">
              <TonePicker value={tones} onChange={setTones} />
              <label htmlFor="compose-text" className="sr-only">Your message</label>
              <textarea
                id="compose-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={1}
                maxLength={2000}
                placeholder={mode === "symbols" ? "Tap phrases, then edit…" : "Message…"}
                className="font-read block max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[1.0625rem] outline-none placeholder:text-ink-2 [field-sizing:content]"
              />
              {text.trim() ? (
                <>
                  {hasKey && <WordingMenu current={wording} onPick={startWith} label="Help me word it" />}
                  <button
                    type="button"
                    onClick={sendManual}
                    disabled={isSending}
                    className="min-h-11 rounded-full px-3 font-extrabold text-teal hover:bg-teal-soft disabled:opacity-50"
                  >
                    {isSending ? "Sending…" : "Send"}
                  </button>
                </>
              ) : (
                <ModeBar mode={mode} onChange={switchMode} />
              )}
            </div>
          )}

          <div className="flex items-center gap-2 px-2 text-xs text-ink-2">
            {!isMedia && text.length > 1500 && <span className={text.length > 1900 ? "font-bold text-clay" : ""}>{text.length}/2000</span>}
            {!hasKey && !isMedia && needsKeyNotice}
            <span className="ml-auto truncate">To: {memberNames.join(", ")}</span>
          </div>
          {sendError && <Notice tone="warn">{sendError} <button className="font-bold underline" onClick={sendManual}>Retry</button></Notice>}
        </div>
      )}

      {stage === "processing" && (
        <div className={`${cardClass} flex items-center gap-3`} role="status" aria-live="polite">
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-teal" />
          <div className="min-w-0 flex-1">
            <p className="font-extrabold">{stageLabel}…</p>
            {!isMedia && text && <p className="font-read truncate text-sm text-ink-2">Your words: “{text}”</p>}
          </div>
          <Button onClick={cancel}>Cancel</Button>
        </div>
      )}

      {stage === "transcript" && pending?.kind === "transcript" && (
        <div className={`${cardClass} space-y-3`}>
          <div className="flex items-center gap-2">
            <FileAudio aria-hidden="true" className="h-5 w-5 text-teal" />
            <h3 className="text-lg font-extrabold">Is this what you said?</h3>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm text-ink-2">Fix anything that’s wrong before any rewording.</span>
            <textarea value={transcriptEdit} onChange={(e) => setTranscriptEdit(e.target.value)} rows={3} maxLength={2000} className={`${inputClass} font-read text-lg`} />
          </label>
          {pending.uncertainSpans.length > 0 && (
            <Notice tone="uncertain" title="Not sure about">
              {pending.uncertainSpans.map((s) => `“${s.text}”`).join(", ")}
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Button tone="primary" disabled={!transcriptEdit.trim()} onClick={() => reviewManually(transcriptEdit)}>Use these words</Button>
            <Button disabled={!transcriptEdit.trim()} onClick={() => resume({ transcript: transcriptEdit, wording_mode: wording })}>
              <Sparkles aria-hidden="true" className="h-4 w-4" /> Help me word it
            </Button>
            <Button tone="ghost" onClick={cancel}>Record again</Button>
          </div>
        </div>
      )}

      {stage === "clarify" && pending?.kind === "clarify" && (
        <div className={`${cardClass} space-y-4`}>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-ink">
            <CircleHelp aria-hidden="true" className="h-4 w-4" /> One question, so nothing is guessed
          </p>
          <h3 className="text-xl font-extrabold">{pending.question}</h3>
          <div className="flex flex-wrap gap-2">
            {pending.choices.map((c) => (
              <button key={c} type="button" onClick={() => resume({ answer: c })} className="min-h-11 rounded-full border-2 border-ink px-4 font-bold hover:bg-ink hover:text-paper">
                {c}
              </button>
            ))}
            <button type="button" onClick={() => setOtherAnswer("")} className="min-h-11 rounded-full border-2 border-dashed border-line px-4 font-bold text-ink-2 hover:border-ink-2">
              Something else
            </button>
          </div>
          {otherAnswer !== null && (
            <form onSubmit={(e) => { e.preventDefault(); if (otherAnswer.trim()) resume({ answer: otherAnswer }); }} className="flex gap-2">
              <label className="sr-only" htmlFor="other-answer">Your answer</label>
              <input id="other-answer" value={otherAnswer} onChange={(e) => setOtherAnswer(e.target.value)} maxLength={300} className={`${inputClass} flex-1`} autoFocus />
              <Button tone="primary" type="submit" disabled={!otherAnswer.trim()}>Answer</Button>
            </form>
          )}
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Button tone="ghost" onClick={() => reviewManually()}><Pencil aria-hidden="true" className="h-4 w-4" /> I’ll edit it myself</Button>
            <Button tone="ghost" onClick={cancel}>Cancel</Button>
          </div>
        </div>
      )}

      {stage === "review" && draft && (
        <div className={cardClass}>
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
        </div>
      )}
    </section>
  );
}
