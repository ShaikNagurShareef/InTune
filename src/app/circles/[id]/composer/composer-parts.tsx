"use client";

import { useState } from "react";

import { MAX_TONE_TAGS, TONE_TAGS } from "@/lib/social";
import type { PhraseLite } from "../types";
import type { InputMode } from "./types";

const MODE_TOGGLES: { value: Exclude<InputMode, "type">; icon: string; label: string }[] = [
  { value: "symbols", icon: "🔤", label: "Phrases" },
  { value: "speak", icon: "🎤", label: "Speak" },
  { value: "video", icon: "🎥", label: "Video" },
];

/** Inline input-mode toggles (21st.dev "liquid input" pattern): typing is the default; others are one tap away. */
export function ModeBar({ mode, onChange }: { mode: InputMode; onChange: (mode: InputMode) => void }) {
  return (
    <div role="group" aria-label="Other ways to say it" className="flex gap-1">
      {MODE_TOGGLES.map((m) => {
        const isOn = mode === m.value;
        return (
          <button
            key={m.value}
            type="button"
            aria-pressed={isOn}
            onClick={() => onChange(isOn ? "type" : m.value)}
            className={`inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-bold transition ${
              isOn ? "bg-teal text-teal-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
            }`}
          >
            <span aria-hidden="true">{m.icon}</span>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

/** Ready-made replies that make it easy to ask for clarity or time; they fill the box, never send. */
const SUPPORT_REPLIES = [
  "Can you say that more directly?",
  "I need more time to reply.",
  "I'm overwhelmed. I'll reply later.",
  "Yes",
  "No",
  "Thank you",
];

export function QuickReplies({ phrases, onPick }: { phrases: PhraseLite[]; onPick: (text: string) => void }) {
  const items = [...SUPPORT_REPLIES, ...phrases.slice(0, 4).map((p) => p.phrase)];
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Quick replies">
      {items.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onPick(t)}
          className="min-h-9 shrink-0 whitespace-nowrap rounded-full border border-line bg-card px-3 text-sm hover:border-teal"
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/**
 * Optional tone tags chosen by the sender, so the reader doesn't have to guess (never set by AI).
 * Collapsed behind one button so the composer stays calm; chosen tags stay visible.
 */
export function ToneChips({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < MAX_TONE_TAGS) onChange([...value, id]);
  };
  const chosen = TONE_TAGS.filter((t) => value.includes(t.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-bold text-ink-2 hover:bg-paper-2 hover:text-ink"
      >
        <span aria-hidden="true">🙂</span>
        {isOpen ? "Done" : chosen.length ? "Change tone" : "Add tone"}
      </button>
      {(isOpen ? TONE_TAGS : chosen).map((t) => {
        const isOn = value.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={isOn}
            onClick={() => toggle(t.id)}
            disabled={!isOn && value.length >= MAX_TONE_TAGS}
            className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-xs font-bold transition disabled:opacity-40 ${
              isOn ? "border-teal bg-teal-soft text-ink" : "border-line bg-card text-ink-2 hover:border-ink-2"
            }`}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
