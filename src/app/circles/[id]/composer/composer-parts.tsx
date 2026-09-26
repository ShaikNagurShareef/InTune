"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, LayoutGrid, Mic, Smile, Sparkles, Video, X } from "lucide-react";
import { MAX_TONE_TAGS, TONE_TAGS } from "@/lib/social";
import type { PhraseLite } from "../types";
import type { InputMode, WordingMode } from "./types";

/** Closes a popover on Escape or outside click. */
function usePopover() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setIsOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [isOpen]);
  return { isOpen, setIsOpen, ref };
}

const iconButton = "grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:bg-paper-2";

const MODE_TOGGLES: { value: Exclude<InputMode, "type">; icon: typeof Mic; label: string }[] = [
  { value: "symbols", icon: LayoutGrid, label: "Phrases" },
  { value: "speak", icon: Mic, label: "Speak" },
  { value: "video", icon: Video, label: "Video" },
];

/** Inline input-mode buttons inside the message pill: typing is the default; others are one tap away. */
export function ModeBar({ mode, onChange }: { mode: InputMode; onChange: (mode: InputMode) => void }) {
  return (
    <div role="group" aria-label="Other ways to say it" className="flex">
      {MODE_TOGGLES.map((m) => {
        const isOn = mode === m.value;
        return (
          <button
            key={m.value}
            type="button"
            aria-pressed={isOn}
            aria-label={m.label}
            title={m.label}
            onClick={() => onChange(isOn ? "type" : m.value)}
            className={`${iconButton} ${isOn ? "text-teal" : "text-ink"}`}
          >
            <m.icon aria-hidden="true" className="h-6 w-6" strokeWidth={isOn ? 2.4 : 1.8} />
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
    <div className="scrollbar-none -mx-2 flex gap-2 overflow-x-auto px-2" role="group" aria-label="Quick replies">
      {items.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onPick(t)}
          className="min-h-9 shrink-0 whitespace-nowrap rounded-full border border-line px-3 text-sm font-semibold hover:bg-paper-2"
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function ToneButton({ id, isOn, disabled, onClick, children }: { id: string; isOn: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      key={id}
      type="button"
      aria-pressed={isOn}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-bold transition disabled:opacity-40 ${
        isOn ? "border-teal bg-teal-soft text-teal" : "border-line bg-card hover:border-ink-2"
      }`}
    >
      {children}
    </button>
  );
}

function useToneToggle(value: string[], onChange: (next: string[]) => void) {
  return (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < MAX_TONE_TAGS) onChange([...value, id]);
  };
}

/** Smile button in the message pill; opens the sender-chosen tone tags (never set by AI). */
export function TonePicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const { isOpen, setIsOpen, ref } = usePopover();
  const toggle = useToneToggle(value, onChange);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Add a tone"
        aria-expanded={isOpen}
        title="Add a tone"
        onClick={() => setIsOpen((v) => !v)}
        className={`${iconButton} ${value.length ? "text-teal" : "text-ink"}`}
      >
        <Smile aria-hidden="true" className="h-6 w-6" strokeWidth={1.8} />
      </button>
      {isOpen && (
        <div role="group" aria-label="Tone" className="absolute bottom-full left-0 z-30 mb-2 w-[min(20rem,calc(100vw-2rem))] rounded-3xl border border-line bg-card p-3 shadow-[var(--shadow-lg)]">
          <p className="mb-2 text-sm font-extrabold">Add a tone</p>
          <p className="mb-3 text-xs text-ink-2">So nobody has to guess. Pick up to {MAX_TONE_TAGS}.</p>
          <div className="flex flex-wrap gap-2">
            {TONE_TAGS.map((t) => {
              const isOn = value.includes(t.id);
              return (
                <ToneButton key={t.id} id={t.id} isOn={isOn} disabled={!isOn && value.length >= MAX_TONE_TAGS} onClick={() => toggle(t.id)}>
                  <span aria-hidden="true">{t.icon}</span>
                  {t.label}
                </ToneButton>
              );
            })}
          </div>
          <button type="button" onClick={() => setIsOpen(false)} className="bg-brand mt-3 min-h-10 w-full rounded-xl text-sm font-bold text-on-brand">
            Done
          </button>
        </div>
      )}
    </div>
  );
}

/** The tones chosen for the next message, removable. */
export function ChosenTones({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const chosen = TONE_TAGS.filter((t) => value.includes(t.id));
  return (
    <ul aria-label="Tone for this message" className="flex flex-wrap gap-1.5 px-1">
      {chosen.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== t.id))}
            aria-label={`Remove tone: ${t.label}`}
            className="inline-flex min-h-8 items-center gap-1 rounded-full bg-teal-soft px-2.5 text-xs font-bold text-teal"
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
            <X aria-hidden="true" className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Review screen: tones shown as toggles (changing them re-versions the draft). */
export function ToneChips({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const toggle = useToneToggle(value, onChange);
  return (
    <div role="group" aria-label="Tone" className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-bold text-ink-2">Tone:</span>
      {TONE_TAGS.map((t) => {
        const isOn = value.includes(t.id);
        return (
          <ToneButton key={t.id} id={t.id} isOn={isOn} disabled={!isOn && value.length >= MAX_TONE_TAGS} onClick={() => toggle(t.id)}>
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </ToneButton>
        );
      })}
    </div>
  );
}

const WORDING_OPTIONS: { value: WordingMode; label: string; hint: string }[] = [
  { value: "clearer", label: "Clear & complete", hint: "Turns your words into plain, complete sentences others can act on." },
  { value: "shorter", label: "Short & direct", hint: "Fewest words, every detail kept." },
  { value: "keep", label: "Just fix slips", hint: "Keeps your wording; only fixes obvious typos or transcription slips." },
];

/** ✨ Help me word it: choose a style and start. Nothing is sent until you approve the exact words. */
export function WordingMenu({
  current,
  onPick,
  label,
  disabled = false,
  primary = false,
}: {
  current: WordingMode;
  onPick: (mode: WordingMode) => void;
  label: string;
  disabled?: boolean;
  primary?: boolean;
}) {
  const { isOpen, setIsOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
        aria-label={label}
        title={label}
        className={
          primary
            ? "bg-ai-solid inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-bold disabled:opacity-40"
            : `${iconButton} text-ai disabled:opacity-40`
        }
      >
        <Sparkles aria-hidden="true" className="h-5 w-5" />
        {primary && label}
      </button>
      {isOpen && (
        <ul role="menu" className="absolute bottom-full right-0 z-30 mb-2 w-72 rounded-3xl border border-line bg-card p-2 shadow-[var(--shadow-lg)]">
          <li role="none" className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-ink-2">Translate style</li>
          {WORDING_OPTIONS.map((o) => (
            <li key={o.value} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onPick(o.value);
                }}
                className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-paper-2"
              >
                <span className="mt-0.5 w-4">{current === o.value && <Check aria-hidden="true" className="h-4 w-4 text-teal" />}</span>
                <span>
                  <span className="block text-sm font-bold">{o.label}</span>
                  <span className="block text-xs text-ink-2">{o.hint}</span>
                </span>
              </button>
            </li>
          ))}
          <li role="none" className="px-3 pb-2 pt-1 text-[11px] text-ink-2">You’ll check the exact words before anything is sent.</li>
        </ul>
      )}
    </div>
  );
}

/**
 * The main AI action: ✨ Translate what you mean into a clear message (with the remembered style),
 * plus a ▾ menu to pick another style. Nothing is sent until you approve the exact words.
 */
export function TranslateButton({ current, onTranslate }: { current: WordingMode; onTranslate: (mode: WordingMode) => void }) {
  const { isOpen, setIsOpen, ref } = usePopover();
  const currentLabel = WORDING_OPTIONS.find((o) => o.value === current)?.label ?? "Clear & complete";
  return (
    <div ref={ref} className="relative flex shrink-0">
      <button
        type="button"
        onClick={() => onTranslate(current)}
        title={`Translate (${currentLabel})`}
        className="bg-ai-solid inline-flex min-h-11 items-center gap-1.5 rounded-l-full pl-3 pr-2 text-sm font-extrabold shadow-[var(--shadow)] hover:brightness-110"
      >
        <Sparkles aria-hidden="true" className="h-4 w-4" />
        Translate
      </button>
      <button
        type="button"
        aria-label="Translate style"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        className="bg-ai-solid inline-flex min-h-11 items-center rounded-r-full border-l border-current/25 pl-1.5 pr-2.5 hover:brightness-110"
      >
        <ChevronDown aria-hidden="true" className="h-4 w-4" />
      </button>
      {isOpen && (
        <ul role="menu" className="absolute bottom-full right-0 z-30 mb-2 w-72 rounded-3xl border border-line bg-card p-2 shadow-[var(--shadow-lg)]">
          <li role="none" className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-ink-2">Translate style</li>
          {WORDING_OPTIONS.map((o) => (
            <li key={o.value} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onTranslate(o.value);
                }}
                className="flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-paper-2"
              >
                <span className="mt-0.5 w-4">{current === o.value && <Check aria-hidden="true" className="h-4 w-4 text-teal" />}</span>
                <span>
                  <span className="block text-sm font-bold">{o.label}</span>
                  <span className="block text-xs text-ink-2">{o.hint}</span>
                </span>
              </button>
            </li>
          ))}
          <li role="none" className="px-3 pb-2 pt-1 text-[11px] text-ink-2">You’ll see your words beside the translation and approve it before anything is sent.</li>
        </ul>
      )}
    </div>
  );
}
