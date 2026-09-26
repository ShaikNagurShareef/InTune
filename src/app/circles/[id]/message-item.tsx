"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Ban, EyeOff, Flag, Lightbulb, Pencil, Reply, Square, Trash2, Volume2 } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useHasGeminiKey } from "@/lib/client/byok";
import { toneInfo } from "@/lib/social";
import { ActionMenu, type MenuAction } from "@/components/action-menu";
import { Avatar } from "@/components/avatar";
import { Modal } from "@/components/modal";
import { Button, Notice, inputClass } from "@/components/ui";
import { speak, useSpeechAvailable } from "@/components/speech";
import type { FeedMessage, ReplyTarget } from "./types";
import { UnderstandPanel, type ReadingAid } from "./understand-panel";

interface Props {
  message: FeedMessage;
  replyTo: FeedMessage | undefined;
  audioRate: number;
  showSender: boolean;
  /** First message of a run from this sender (shows name in circles). */
  startsGroup: boolean;
  /** Last message of a run (shows avatar and the bubble tail). */
  endsGroup: boolean;
  onReply: (target: ReplyTarget) => void;
  onHide: (id: string) => void;
  onChanged: () => void;
}

export function MessageItem({ message: m, replyTo, audioRate, showSender, startsGroup, endsGroup, onReply, onHide, onChanged }: Props) {
  const hasKey = useHasGeminiKey();
  const canSpeak = useSpeechAvailable();
  const [storedAid, setAid] = useState<ReadingAid | null>(null);
  // A reading aid for an older version is dropped as soon as the sender's correction arrives.
  const aid = storedAid && storedAid.messageVersion === m.version ? storedAid : null;
  const [aidState, setAidState] = useState<"idle" | "loading" | "error">("idle");
  const [aidError, setAidError] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "report">("view");
  const [editText, setEditText] = useState(m.text ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const aidRef = useRef<HTMLDivElement | null>(null);

  if (m.deleted) {
    return (
      <li className={`mt-2 flex ${m.mine ? "justify-end" : "justify-start pl-9"}`}>
        <span className="rounded-[22px] border border-dashed border-line px-4 py-2 text-sm italic text-ink-2">
          {m.mine ? "You deleted this message." : `${m.senderName}’s message was deleted.`}
        </span>
      </li>
    );
  }
  const text = m.text ?? "";
  const tags = m.toneTags.map(toneInfo).filter((t) => t !== undefined);

  const understand = async () => {
    if (aid) {
      setAid(null);
      return;
    }
    setAidState("loading");
    try {
      setAid(await api<ReadingAid>(`/api/v1/messages/${m.id}/simplify`, { method: "POST", gemini: true }));
      setAidState("idle");
      requestAnimationFrame(() => aidRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    } catch (err) {
      setAidError(err instanceof ApiError ? err.message : "Couldn't prepare reading help.");
      setAidState("error");
    }
  };

  const listen = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    if (speak(aid?.simplifiedText ?? text, audioRate, () => setIsSpeaking(false))) setIsSpeaking(true);
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
    if (!confirm(`Block ${m.senderName}? You won't see their messages. They aren't told.`)) return;
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

  const reply = () => onReply({ id: m.id, senderName: m.mine ? "yourself" : m.senderName, snippet: text.slice(0, 80) });
  const actions: MenuAction[] = [
    { label: "Reply", icon: Reply, onSelect: reply },
    ...(canSpeak ? [{ label: isSpeaking ? "Stop listening" : "Listen", icon: isSpeaking ? Square : Volume2, onSelect: listen }] : []),
    ...(m.mine
      ? [
          { label: "Edit", icon: Pencil, onSelect: () => { setEditText(text); setMode("edit"); } },
          { label: "Delete", icon: Trash2, onSelect: remove, danger: true },
        ]
      : [
          { label: "Hide", icon: EyeOff, onSelect: () => onHide(m.id) },
          { label: "Report", icon: Flag, onSelect: () => setMode("report") },
          { label: `Block ${m.senderName}`, icon: Ban, onSelect: block, danger: true },
        ]),
  ];

  const bubble =
    mode === "edit" ? (
      <div className="w-full max-w-md space-y-2 rounded-[22px] border border-line bg-card p-3">
        <label className="sr-only" htmlFor={`edit-${m.id}`}>Edit your message</label>
        <textarea id={`edit-${m.id}`} value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} maxLength={2000} className={inputClass} />
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={() => setMode("view")}>Cancel</Button>
          <Button tone="primary" onClick={saveEdit} disabled={!editText.trim()}>Save correction</Button>
        </div>
      </div>
    ) : (
      <div
        className={`font-read relative whitespace-pre-wrap break-words px-4 py-2.5 text-[1.0625rem] leading-relaxed ${
          m.mine
            ? `bg-brand rounded-[22px] text-white ${endsGroup ? "rounded-br-md" : ""}`
            : `bg-bubble rounded-[22px] text-ink ${endsGroup ? "rounded-bl-md" : ""}`
        } ${tags.length ? "mb-3.5" : ""}`}
      >
        {text}
        {tags.length > 0 && (
          <ul aria-label="Tone chosen by the sender" className={`absolute -bottom-3.5 flex gap-1 ${m.mine ? "right-2" : "left-2"}`}>
            {tags.map((t) => (
              <li
                key={t.id}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line bg-card px-2 py-0.5 font-sans text-[11px] font-bold text-ink shadow-[var(--shadow)]"
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    );

  const helpButton = hasKey ? (
    <button
      type="button"
      onClick={understand}
      disabled={aidState === "loading"}
      aria-pressed={Boolean(aid)}
      aria-label={aid ? "Hide reading help" : "Help me understand"}
      title="Help me understand"
      className={`grid h-10 w-10 place-items-center rounded-full transition hover:bg-paper-2 ${aid ? "text-teal" : "text-ink-2 hover:text-ink"}`}
    >
      <Lightbulb aria-hidden="true" className={`h-5 w-5 ${aidState === "loading" ? "animate-pulse" : ""}`} />
    </button>
  ) : (
    <Link
      href="/settings"
      aria-label="Help me understand (add your Gemini key)"
      title="Add a key to get reading help"
      className="grid h-10 w-10 place-items-center rounded-full text-ink-2/60 hover:bg-paper-2"
    >
      <Lightbulb aria-hidden="true" className="h-5 w-5" />
    </Link>
  );

  const meta = [m.aiAssisted && (m.mine ? "AI-assisted · you approved" : "AI-assisted · approved by sender"), m.edited && "Edited"]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className={`flex flex-col ${m.mine ? "items-end" : "items-start"} ${startsGroup ? "mt-3" : "mt-0.5"}`}>
      {showSender && !m.mine && startsGroup && <p className="mb-1 ml-12 text-xs font-semibold text-ink-2">{m.senderName}</p>}
      {replyTo && (
        <p className={`mb-1 max-w-[70%] truncate rounded-2xl bg-paper-2 px-3 py-1.5 text-xs text-ink-2 ${m.mine ? "" : "ml-9"}`}>
          <Reply aria-hidden="true" className="mr-1 inline h-3 w-3" />
          {m.mine ? "You replied to " : "Replied to "}
          {replyTo.mine ? "you" : replyTo.senderName}: {replyTo.deleted ? "(deleted)" : (replyTo.text ?? "").slice(0, 60)}
        </p>
      )}
      <div className={`flex max-w-full items-end gap-1 ${m.mine ? "flex-row-reverse" : ""}`}>
        {!m.mine && <span className="w-8 shrink-0">{endsGroup && <Avatar name={m.senderName} seed={m.senderId} size="xs" />}</span>}
        <div className="min-w-0 max-w-[min(34rem,calc(100vw-8.5rem))]">{bubble}</div>
        {mode === "view" && (
          <div className={`flex shrink-0 items-center self-center ${m.mine ? "flex-row-reverse" : ""}`}>
            {!m.mine && helpButton}
            <ActionMenu label="More actions for this message" actions={actions} align={m.mine ? "right" : "left"} />
          </div>
        )}
      </div>

      {aid && (
        <div ref={aidRef} className={`w-full max-w-[36rem] scroll-mb-4 ${m.mine ? "" : "pl-9"}`}>
          <UnderstandPanel aid={aid} />
        </div>
      )}
      {aidState === "error" && aidError && <div className="mt-1 max-w-md pl-9"><Notice tone="warn">{aidError}</Notice></div>}
      {isSpeaking && (
        <p role="status" className="mt-1 flex items-center gap-1 pl-9 text-xs font-semibold text-teal">
          <Volume2 aria-hidden="true" className="h-3.5 w-3.5" /> Reading aloud…
        </p>
      )}
      {notice && <p role="status" className="mt-1 text-xs text-ink-2">{notice}</p>}
      {meta && endsGroup && <p className={`mt-1 text-[11px] text-ink-2 ${m.mine ? "px-1" : "pl-9"}`}>{meta}</p>}

      {mode === "report" && (
        <Modal title="Report message" onClose={() => setMode("view")}>
          <form action={report} className="space-y-3 p-4">
            <p className="font-read rounded-2xl bg-paper-2 p-3 text-sm">{text}</p>
            <label className="block">
              <span className="mb-1 block text-sm font-bold">What’s wrong?</span>
              <input name="reason" required maxLength={500} className={inputClass} />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="include" defaultChecked className="h-5 w-5" /> Include the message text in the report
            </label>
            <p className="text-xs text-ink-2">The circle owner reviews reports. No AI is used.</p>
            <Button tone="primary" type="submit" className="w-full">Send report</Button>
          </form>
        </Modal>
      )}
    </li>
  );
}
