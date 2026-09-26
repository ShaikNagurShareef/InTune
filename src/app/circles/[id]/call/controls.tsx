"use client";

import { useEffect, useRef, useState } from "react";
import { Captions, Eye, Hand, Keyboard, MessageSquareText, Mic, MicOff, MoreHorizontal, PhoneOff, Sparkles, Video, VideoOff, Volume2 } from "lucide-react";
import { SIGNALS, type SignalKind } from "./protocol";
import type { PanelTab } from "./conversation-panel";
import type { CallSettings } from "./types";

interface Props {
  settings: CallSettings;
  onChange: (patch: Partial<CallSettings>) => void;
  panel: PanelTab | null;
  onPanel: (tab: PanelTab) => void;
  onSignal: (kind: SignalKind) => void;
  onLeave: () => void;
  /** Null when this person can't end the call for everyone (only the starter or owner can, in groups). */
  onEndForEveryone: (() => void) | null;
}

interface ControlProps {
  label: string;
  pressed?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  expanded?: boolean;
}

function Control({ label, pressed, danger, onClick, children, expanded }: ControlProps) {
  const tone = danger ? "bg-clay text-paper" : pressed === false ? "bg-clay-soft text-ink" : pressed ? "bg-sage-soft text-ink" : "bg-paper-2 text-ink";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      onClick={onClick}
      className={`flex min-h-12 w-full min-w-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-2xl px-1 py-1.5 text-[11px] font-bold transition active:scale-95 sm:w-auto sm:px-3 ${tone}`}
    >
      {children}
    </button>
  );
}

const MENU = "absolute bottom-full mb-2 w-72 rounded-2xl border border-line bg-card p-2 shadow-[var(--shadow-lg)]";
const ITEM = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold hover:bg-paper-2";

interface DisclosureProps {
  label: string;
  icon: React.ReactNode;
  text: string;
  menuClass: string;
  children: (close: () => void) => React.ReactNode;
}

/** A button that shows a small panel; closes on Escape, a tap outside, or when focus moves away. */
function Disclosure({ label, icon, text, menuClass, children }: DisclosureProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <div
      ref={ref}
      className="relative min-w-0"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Control label={label} expanded={open} onClick={() => setOpen((v) => !v)}>
        {icon}
        {text}
      </Control>
      {open && <div className={`${MENU} ${menuClass}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

function SignalMenu({ onSignal }: { onSignal: (kind: SignalKind) => void }) {
  return (
    <Disclosure label="Send a signal" icon={<Hand aria-hidden="true" className="h-5 w-5" />} text="Signal" menuClass="-left-24 sm:left-1/2 sm:-translate-x-1/2">
      {(close) => (
        <div role="group" aria-label="Signals">
          <p className="px-3 py-1 text-xs text-ink-2">Everyone sees this for a short time.</p>
          {SIGNALS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={ITEM}
              onClick={() => {
                onSignal(s.id);
                close();
              }}
            >
              <s.icon aria-hidden="true" className="h-5 w-5 text-ink-2" /> {s.label}
            </button>
          ))}
        </div>
      )}
    </Disclosure>
  );
}

function EndForEveryone({ onEnd }: { onEnd: () => void }) {
  const [confirming, setConfirming] = useState(false);
  // The first button stays mounted, so focus never drops out of the menu while confirming.
  return (
    <>
      <button type="button" aria-expanded={confirming} className={`${ITEM} text-clay`} onClick={() => setConfirming((v) => !v)}>
        <PhoneOff aria-hidden="true" className="h-5 w-5" /> End call for everyone…
      </button>
      {confirming && (
        <div className="space-y-2 px-3 py-1">
          <p className="text-sm">End the call for everyone?</p>
          <div className="flex gap-2">
            <button type="button" className="min-h-11 flex-1 rounded-xl bg-clay px-3 text-sm font-bold text-paper" onClick={onEnd}>
              End for all
            </button>
            <button type="button" className="min-h-11 flex-1 rounded-xl bg-paper-2 px-3 text-sm font-bold" onClick={() => setConfirming(false)}>
              Keep going
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function MoreMenu({ settings, onChange, onEndForEveryone }: Pick<Props, "settings" | "onChange" | "onEndForEveryone">) {
  return (
    <Disclosure label="More options" icon={<MoreHorizontal aria-hidden="true" className="h-5 w-5" />} text="More" menuClass="right-0">
      {() => (
        <>
          <MenuToggle icon={<Captions className="h-5 w-5" />} label="Share captions of my voice" checked={settings.captions} onChange={(v) => onChange({ captions: v })} />
          <MenuToggle icon={<Sparkles className="h-5 w-5" />} label="AI interpreter" checked={settings.interpreter} onChange={(v) => onChange({ interpreter: v })} />
          <MenuToggle icon={<Volume2 className="h-5 w-5" />} label="Read typed messages aloud" checked={settings.readAloud} onChange={(v) => onChange({ readAloud: v })} />
          <MenuToggle icon={<Eye className="h-5 w-5" />} label="Show my own video" checked={settings.selfView} onChange={(v) => onChange({ selfView: v })} />
          {onEndForEveryone && (
            <>
              <hr className="my-2 border-line" />
              <EndForEveryone onEnd={onEndForEveryone} />
            </>
          )}
        </>
      )}
    </Disclosure>
  );
}

/** Only the essentials sit in the bar; everything else is one tap away in “More”. */
export function CallControls({ settings, onChange, panel, onPanel, onSignal, onLeave, onEndForEveryone }: Props) {
  return (
    <nav aria-label="Call controls" className="grid shrink-0 grid-cols-7 items-center gap-1 border-t border-line bg-paper px-2 py-2 sm:flex sm:justify-center sm:gap-3">
      <Control label={settings.mic ? "Mute microphone" : "Unmute microphone"} pressed={settings.mic} onClick={() => onChange({ mic: !settings.mic })}>
        {settings.mic ? <Mic aria-hidden="true" className="h-5 w-5" /> : <MicOff aria-hidden="true" className="h-5 w-5" />}
        {settings.mic ? "Mic" : "Muted"}
      </Control>
      <Control label={settings.camera ? "Turn camera off" : "Turn camera on"} pressed={settings.camera} onClick={() => onChange({ camera: !settings.camera })}>
        {settings.camera ? <Video aria-hidden="true" className="h-5 w-5" /> : <VideoOff aria-hidden="true" className="h-5 w-5" />}
        Camera
      </Control>
      <SignalMenu onSignal={onSignal} />
      <Control label="Type and say it for me" pressed={panel === "say" ? true : undefined} onClick={() => onPanel("say")}>
        <Keyboard aria-hidden="true" className="h-5 w-5" />
        Say it
      </Control>
      <Control label="Captions and interpreter" pressed={panel === "conversation" ? true : undefined} onClick={() => onPanel("conversation")}>
        <MessageSquareText aria-hidden="true" className="h-5 w-5" />
        Captions
      </Control>
      <MoreMenu settings={settings} onChange={onChange} onEndForEveryone={onEndForEveryone} />
      <Control label="Leave the call" danger onClick={onLeave}>
        <PhoneOff aria-hidden="true" className="h-5 w-5" />
        Leave
      </Control>
    </nav>
  );
}

function MenuToggle({ icon, label, checked, onChange }: { icon: React.ReactNode; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`${ITEM} cursor-pointer`}>
      <span aria-hidden="true" className="text-ink-2">{icon}</span>
      <span className="flex-1">{label}</span>
      <input type="checkbox" className="h-5 w-5 accent-[var(--color-sage)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
