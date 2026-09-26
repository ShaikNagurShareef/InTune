"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { useHasGeminiKey } from "@/lib/client/byok";
import { Button, Notice, Tag, inputClass } from "@/components/ui";
import { speak, useSpeechAvailable } from "@/components/speech";
import { toneInfo } from "@/lib/social";
import type { FeedMessage, ReplyTarget } from "./types";
import { UnderstandPanel, type ReadingAid } from "./understand-panel";


interface Props {
  message: FeedMessage;
  replyTo: FeedMessage | undefined;
  audioRate: number;
  showSender: boolean;
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

export function MessageItem({ message: m, replyTo, audioRate, showSender, onReply, onHide, onChanged }: Props) {
  const hasKey = useHasGeminiKey();
  const [storedAid, setAid] = useState<ReadingAid | null>(null);
  // A reading aid for an older version is dropped as soon as the sender's correction arrives.
  const aid = storedAid && storedAid.messageVersion === m.version ? storedAid : null;
  const [aidState, setAidState] = useState<"idle" | "loading" | "error">("idle");
  const [aidError, setAidError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "report">("view");
  const [editText, setEditText] = useState(m.text ?? "");
  const [notice, setNotice] = useState<string | null>(null);

  if (m.deleted) {
    return (
      <li className={`w-fit max-w-[85%] rounded-2xl border border-dashed border-line px-4 py-2 text-sm italic text-ink-2 ${m.mine ? "ml-auto" : ""}`}>
        {m.mine ? "You deleted this message." : `${m.senderName}’s message was deleted.`}
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
      setAidError(err instanceof ApiError ? err.message : "Couldn't prepare reading help.");
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
    // Reload so every cached message from the blocked person disappears at once.
    window.location.reload();
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

  const tags = m.toneTags.map(toneInfo).filter((t) => t !== undefined);
  const time = (
    <time dateTime={m.createdAt} className="text-xs text-ink-2" suppressHydrationWarning>
      {timeFormat.format(new Date(m.createdAt))}
    </time>
  );

  return (
    <li className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}>
    <div
      className={`group relative w-fit min-w-[12rem] max-w-[92%] border px-4 py-3 shadow-[var(--shadow)] sm:max-w-[78%] ${
        m.mine
          ? "rounded-2xl rounded-br-md border-teal/25 bg-teal-soft"
          : "rounded-2xl rounded-bl-md border-line bg-card"
      } ${tags.length ? "mb-4" : ""}`}
    >
      {!m.mine && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {showSender && <span className="font-bold">{m.senderName}</span>}
          {time}
          {m.aiAssisted && <Tag tone="ai">AI-assisted · approved by sender</Tag>}
          {m.edited && <Tag>Edited</Tag>}
        </div>
      )}
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
        <div className={m.mine ? "" : "mt-1"}>
          <p className="whitespace-pre-wrap break-words text-lg leading-relaxed">{text}</p>
          {aid && <UnderstandPanel aid={aid} />}
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
                {aidState === "loading" ? "Reading…" : aid ? "Hide help" : "💡 Help me understand"}
              </Button>
            ) : (
              <Link href="/settings" className="inline-flex min-h-11 items-center px-3 text-sm text-ink-2 underline underline-offset-4">
                💡 Help me understand (add key)
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
      {tags.length > 0 && (
        <ul
          aria-label="Tone chosen by the sender"
          className={`absolute -bottom-3.5 flex gap-1 ${m.mine ? "right-3" : "left-3"}`}
        >
          {tags.map((t) => (
            <li key={t.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2 py-0.5 text-xs font-bold shadow-[var(--shadow)]">
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </li>
          ))}
        </ul>
      )}
    </div>
    {m.mine && (
      <p className="mt-1 flex flex-wrap justify-end gap-x-2 px-1 text-xs text-ink-2">
        {time}
        {m.aiAssisted && <span>AI-assisted · you approved</span>}
        {m.edited && <span>Edited</span>}
      </p>
    )}
    </li>
  );
}
