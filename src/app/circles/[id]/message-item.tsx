"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { useHasGeminiKey } from "@/lib/client/byok";
import { Button, Notice, Tag, inputClass } from "@/components/ui";
import { speak, useSpeechAvailable } from "@/components/speech";
import type { FeedMessage, ReplyTarget } from "./types";

interface ReadingAid {
  simplifiedText: string;
  warnings: string[];
}

interface Props {
  message: FeedMessage;
  replyTo: FeedMessage | undefined;
  audioRate: number;
  onReply: (target: ReplyTarget) => void;
  onHide: (id: string) => void;
  onChanged: () => void;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

function ListenControls({ text, rate }: { text: string; rate: number }) {
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const canSpeak = useSpeechAvailable();
  if (!canSpeak) return <span className="text-xs text-ink-2">No speech voice on this device.</span>;
  const play = () => {
    if (state === "paused") {
      window.speechSynthesis.resume();
    } else {
      speak(text, rate, () => setState("idle"));
    }
    setState("playing");
  };
  return (
    <span className="inline-flex gap-1" role="group" aria-label="Listen">
      {state === "playing" ? (
        <Button tone="ghost" className="text-sm" onClick={() => { window.speechSynthesis.pause(); setState("paused"); }}>
          ❚❚ Pause
        </Button>
      ) : (
        <Button tone="ghost" className="text-sm" onClick={play}>▶ {state === "paused" ? "Resume" : "Listen"}</Button>
      )}
      {state !== "idle" && (
        <Button tone="ghost" className="text-sm" onClick={() => { window.speechSynthesis.cancel(); setState("idle"); }}>
          ■ Stop
        </Button>
      )}
    </span>
  );
}

export function MessageItem({ message: m, replyTo, audioRate, onReply, onHide, onChanged }: Props) {
  const hasKey = useHasGeminiKey();
  const [aid, setAid] = useState<ReadingAid | null>(null);
  const [aidState, setAidState] = useState<"idle" | "loading" | "error">("idle");
  const [aidError, setAidError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "report">("view");
  const [editText, setEditText] = useState(m.text ?? "");
  const [notice, setNotice] = useState<string | null>(null);

  if (m.deleted) {
    return (
      <li className="rounded-xl border border-dashed border-line px-4 py-3 text-sm italic text-ink-2">
        {m.senderName}’s message was deleted.
      </li>
    );
  }
  const text = m.text ?? "";

  const simplify = async () => {
    setAidState("loading");
    try {
      setAid(await api<ReadingAid>(`/api/v1/messages/${m.id}/simplify`, { method: "POST", gemini: true }));
      setAidState("idle");
    } catch (err) {
      setAidError(err instanceof ApiError ? err.message : "Couldn't make a simpler version.");
      setAidState("error");
    }
  };

  const saveEdit = async () => {
    try {
      await api(`/api/v1/messages/${m.id}`, { method: "PATCH", body: { text: editText, expected_version: m.version } });
      setMode("view");
      setAid(null);
      onChanged();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Couldn't save.");
    }
  };

  const remove = async () => {
    if (!confirm("Delete this message for everyone? People who already read it may remember it.")) return;
    await api(`/api/v1/messages/${m.id}`, { method: "DELETE" }).catch(() => undefined);
    onChanged();
  };

  const block = async () => {
    if (!confirm(`Block ${m.senderName}? You won't see their messages. They stay in the circle and aren't told.`)) return;
    await api("/api/v1/blocks", { body: { user_id: m.senderId } }).catch(() => undefined);
    onChanged();
  };

  const report = async (form: FormData) => {
    try {
      await api(`/api/v1/messages/${m.id}/report`, {
        body: { reason: String(form.get("reason") ?? ""), include_text: form.get("include") === "on" },
      });
      setMode("view");
      setNotice("Reported to the circle owner. Thank you.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Couldn't send the report.");
    }
  };

  return (
    <li
      className={`group rounded-2xl border px-4 py-3 ${
        m.mine ? "ml-6 border-teal/25 bg-teal-soft/60 sm:ml-16" : "mr-6 border-line bg-card sm:mr-16"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-bold">{m.mine ? "You" : m.senderName}</span>
        <time dateTime={m.createdAt} className="text-xs text-ink-2" suppressHydrationWarning>{timeFormat.format(new Date(m.createdAt))}</time>
        {m.aiAssisted && <Tag tone="ai">AI-assisted · approved by sender</Tag>}
        {m.edited && <Tag>Edited</Tag>}
      </div>
      {replyTo && (
        <p className="mt-1 border-l-2 border-line pl-2 text-sm text-ink-2">
          Replying to {replyTo.mine ? "you" : replyTo.senderName}: {replyTo.deleted ? "(deleted)" : (replyTo.text ?? "").slice(0, 80)}
        </p>
      )}

      {mode === "edit" ? (
        <div className="mt-2 space-y-2">
          <label className="sr-only" htmlFor={`edit-${m.id}`}>Edit your message</label>
          <textarea id={`edit-${m.id}`} value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} maxLength={2000} className={inputClass} />
          <div className="flex gap-2">
            <Button tone="primary" onClick={saveEdit} disabled={!editText.trim()}>Save correction</Button>
            <Button tone="ghost" onClick={() => setMode("view")}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className={`mt-2 ${aid ? "grid gap-3 md:grid-cols-2" : ""}`}>
          <p className="whitespace-pre-wrap break-words text-lg leading-relaxed">{text}</p>
          {aid && (
            <div className="rounded-xl border border-teal/30 bg-card p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-teal">Simpler version · AI-assisted · only you see this</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-lg">{aid.simplifiedText}</p>
              {aid.warnings.map((w) => (
                <p key={w} className="mt-2 rounded-lg bg-clay-soft px-2 py-1 text-sm">{w}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "report" && (
        <form action={report} className="mt-3 space-y-2 rounded-xl border border-line bg-paper-2 p-3">
          <label className="block">
            <span className="mb-1 block text-sm font-bold">What’s wrong?</span>
            <input name="reason" required maxLength={500} className={inputClass} />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="include" defaultChecked className="h-5 w-5" /> Include the message text in the report
          </label>
          <div className="flex gap-2">
            <Button tone="primary" type="submit">Send report</Button>
            <Button tone="ghost" onClick={() => setMode("view")}>Cancel</Button>
          </div>
        </form>
      )}

      {aidState === "error" && aidError && <div className="mt-2"><Notice tone="warn">{aidError}</Notice></div>}
      {notice && <p className="mt-2 text-sm" role="status">{notice}</p>}

      {mode === "view" && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <ListenControls text={aid?.simplifiedText ?? text} rate={audioRate} />
          {!m.mine && (
            hasKey ? (
              <Button tone="ghost" className="text-sm" onClick={aid ? () => setAid(null) : simplify} disabled={aidState === "loading"}>
                {aidState === "loading" ? "Simplifying…" : aid ? "Hide simpler version" : "Make clearer"}
              </Button>
            ) : (
              <Link href="/settings" className="inline-flex min-h-11 items-center px-3 text-sm text-ink-2 underline underline-offset-4">
                Make clearer (add key)
              </Link>
            )
          )}
          <Button tone="ghost" className="text-sm" onClick={() => onReply({ id: m.id, senderName: m.mine ? "yourself" : m.senderName, snippet: text.slice(0, 80) })}>
            ↩ Reply
          </Button>
          {m.mine ? (
            <>
              <Button tone="ghost" className="text-sm" onClick={() => { setEditText(text); setMode("edit"); }}>Edit</Button>
              <Button tone="ghost" className="text-sm text-clay" onClick={remove}>Delete</Button>
            </>
          ) : (
            <details className="relative">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-xl px-3 text-sm text-ink-2 hover:bg-paper-2">
                More<span className="sr-only"> actions for this message</span>
              </summary>
              <div className="absolute right-0 z-10 mt-1 flex w-44 flex-col rounded-xl border border-line bg-card p-1 shadow-[var(--shadow)]">
                <Button tone="ghost" className="justify-start text-sm" onClick={() => onHide(m.id)}>Hide</Button>
                <Button tone="ghost" className="justify-start text-sm" onClick={() => setMode("report")}>Report</Button>
                <Button tone="ghost" className="justify-start text-sm text-clay" onClick={block}>Block {m.senderName}</Button>
              </div>
            </details>
          )}
        </div>
      )}
    </li>
  );
}
