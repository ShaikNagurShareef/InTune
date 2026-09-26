"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Send, Sparkles, Volume2, X } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useAiAvailable } from "@/components/ai-provider";
import { speak } from "@/components/speech";
import { Button } from "@/components/ui";
import { signalInfo, type Interpretation, type TranscriptEntry } from "./protocol";
import type { CallFeed } from "./use-call-feed";

export type PanelTab = "conversation" | "say";

interface Props {
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onClose: () => void;
  feed: CallFeed;
  callId: string;
  interpreterOn: boolean;
  overlay: boolean;
}

const QUICK_PHRASES = [
  "Give me a moment to think.",
  "Can you say that another way?",
  "I agree.",
  "I’m not sure yet.",
  "I need to leave soon.",
  "Thank you.",
];

export function ConversationPanel({ tab, onTab, onClose, feed, callId, interpreterOn, overlay }: Props) {
  const tabClass = (t: PanelTab) =>
    `min-h-11 flex-1 rounded-xl text-sm font-bold ${tab === t ? "bg-card shadow-[var(--shadow)]" : "text-ink-2 hover:text-ink"}`;
  return (
    <aside
      aria-label="Conversation help"
      className={`flex min-h-0 flex-col border-l border-line bg-paper ${overlay ? "absolute inset-0 z-30 sm:left-auto sm:w-[380px] sm:shadow-[var(--shadow-lg)]" : "w-[380px] shrink-0"}`}
    >
      <div className="flex items-center gap-2 border-b border-line p-2">
        <div role="tablist" aria-label="Panels" className="flex flex-1 gap-1 rounded-2xl bg-paper-2 p-1">
          <button type="button" role="tab" aria-selected={tab === "conversation"} className={tabClass("conversation")} onClick={() => onTab("conversation")}>
            Conversation
          </button>
          <button type="button" role="tab" aria-selected={tab === "say"} className={tabClass("say")} onClick={() => onTab("say")}>
            Say it for me
          </button>
        </div>
        <button type="button" aria-label="Close panel" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full hover:bg-paper-2">
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
      {tab === "conversation" ? (
        <Transcript feed={feed} interpreterOn={interpreterOn} />
      ) : (
        <SayPanel callId={callId} onSay={(text) => {
          feed.sendSay(text);
          onTab("conversation");
        }} />
      )}
    </aside>
  );
}

function Transcript({ feed, interpreterOn }: { feed: CallFeed; interpreterOn: boolean }) {
  const bottom = useRef<HTMLLIElement | null>(null);
  const list = useRef<HTMLOListElement | null>(null);
  const count = feed.entries.length;
  useEffect(() => {
    const el = list.current;
    // Follow new lines only when the person is already at the bottom, so reading earlier lines isn’t interrupted.
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="border-b border-line bg-paper-2 px-4 py-2 text-xs text-ink-2">
        Captions and typed lines are shared with everyone in the call. ✨ interpreter notes are only for you. Nothing is saved.{" "}
        {interpreterOn ? "" : "Turn on the ✨ interpreter in More."}
      </p>
      {feed.interpreterNote && interpreterOn && (
        <p role="status" className="bg-amber-soft px-4 py-2 text-xs text-amber-ink">{feed.interpreterNote}</p>
      )}
      <ol ref={list} aria-label="What was said" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {count === 0 && <li className="p-4 text-center text-sm text-ink-2">When people talk, their words appear here.</li>}
        {feed.entries.map((e) => (
          <Line key={e.id} entry={e} onRetry={() => feed.retryInterpret(e)} />
        ))}
        <li ref={bottom} aria-hidden="true" />
      </ol>
    </div>
  );
}

function Line({ entry, onRetry }: { entry: TranscriptEntry; onRetry: () => void }) {
  const who = entry.mine ? "You" : entry.from.name;
  if (entry.kind === "signal") {
    const info = signalInfo(entry.text);
    return (
      <li className="flex items-center justify-center gap-2 text-sm text-ink-2">
        {info && <info.icon aria-hidden="true" className="h-4 w-4" />}
        <span>
          <strong>{who}</strong>: {info?.label ?? entry.text}
        </span>
      </li>
    );
  }
  return (
    <li className={`rounded-2xl p-3 ${entry.mine ? "ml-6 bg-mine text-on-mine" : "mr-6 bg-bubble"}`}>
      <div className="mb-0.5 flex items-center gap-2 text-xs font-bold opacity-80">
        <span className="flex-1">{who}{entry.kind === "say" ? " · typed" : ""}</span>
        <button type="button" aria-label={`Listen to what ${who} said`} onClick={() => speak(entry.text, 1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-black/10">
          <Volume2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <p className="text-[15px] leading-snug">{entry.text}</p>
      {entry.interp && <InterpretBlock interp={entry.interp} onRetry={onRetry} />}
    </li>
  );
}

function InterpretBlock({ interp, onRetry }: { interp: NonNullable<TranscriptEntry["interp"]>; onRetry: () => void }) {
  if (interp === "loading") {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs text-ai">
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Interpreting…
      </p>
    );
  }
  if (interp === "error") {
    return (
      <button type="button" onClick={onRetry} className="mt-2 text-xs font-bold text-ai underline">
        Couldn’t interpret this line. Try again
      </button>
    );
  }
  return <Interpreted value={interp} />;
}

function Interpreted({ value }: { value: Interpretation }) {
  const reply = value.replyExpected === "yes" ? "Yes" : value.replyExpected === "no" ? "No" : "Not sure";
  return (
    <div className="mt-2 space-y-1 rounded-xl bg-ai-soft p-2.5 text-sm text-ink">
      <p className="flex items-center gap-1 text-xs font-bold text-ai">
        <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> In plain words
      </p>
      <p>{value.plain}</p>
      {value.asking && (
        <p>
          <strong>What they’re asking:</strong> {value.asking}
        </p>
      )}
      <p>
        <strong>Reply needed?</strong> {reply}
      </p>
      {value.unclear && <p className="text-amber-ink">Unclear: {value.unclear}</p>}
      {value.warnings.map((w) => (
        <p key={w} className="flex items-start gap-1 text-xs text-amber-ink">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
        </p>
      ))}
    </div>
  );
}

interface Suggestion {
  text: string;
  flags: string[];
}

/** Type (or tap) instead of speaking; others see it and hear it read aloud. AI wording is only a suggestion. */
function SayPanel({ callId, onSay }: { callId: string; onSay: (text: string) => void }) {
  const aiAvailable = useAiAvailable();
  const [text, setText] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function improve() {
    setBusy(true);
    setError(null);
    try {
      setSuggestion(await api<Suggestion>(`/api/v1/calls/${callId}/say`, { body: { note: text }, gemini: true }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn’t get a suggestion. You can still say your own words.");
    } finally {
      setBusy(false);
    }
  }

  function say(words: string) {
    const clean = words.trim();
    if (!clean) return;
    onSay(clean);
    setText("");
    setSuggestion(null);
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          say(text);
        }}
        className="space-y-2"
      >
        <label htmlFor="say-text" className="block text-sm font-bold">
          Type what you want to say
        </label>
        <textarea
          id="say-text"
          value={text}
          maxLength={500}
          rows={3}
          onChange={(e) => {
            setText(e.target.value);
            setSuggestion(null);
          }}
          className="w-full rounded-2xl border border-line bg-card p-3 text-base"
          placeholder="Others see it and hear it read aloud."
        />
        <div className="flex gap-2">
          {aiAvailable && (
            <Button tone="quiet" disabled={!text.trim() || busy} onClick={() => void improve()} className="flex-1">
              {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Sparkles aria-hidden="true" className="h-4 w-4 text-ai" />}
              Make it clear
            </Button>
          )}
          <Button tone="primary" type="submit" disabled={!text.trim()} className="flex-1">
            <Send aria-hidden="true" className="h-4 w-4" /> Say my words
          </Button>
        </div>
      </form>
      {error && <p role="alert" className="text-sm text-clay">{error}</p>}
      {suggestion && <SuggestionCard suggestion={suggestion} onSay={say} />}
      <QuickPhrases onSay={say} />
    </div>
  );
}

function SuggestionCard({ suggestion, onSay }: { suggestion: Suggestion; onSay: (text: string) => void }) {
  return (
    <div className="space-y-2 rounded-2xl bg-ai-soft p-3" data-testid="say-suggestion">
      <p className="flex items-center gap-1 text-xs font-bold text-ai">
        <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> Suggested wording · check it’s what you mean
      </p>
      <p className="text-base">{suggestion.text}</p>
      {suggestion.flags.map((f) => (
        <p key={f} className="flex items-start gap-1 text-xs text-amber-ink">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {f}
        </p>
      ))}
      <Button tone="primary" className="w-full" onClick={() => onSay(suggestion.text)}>
        Say this
      </Button>
    </div>
  );
}

function QuickPhrases({ onSay }: { onSay: (text: string) => void }) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold">Quick phrases</p>
      <div className="flex flex-wrap gap-2">
        {QUICK_PHRASES.map((p) => (
          <button key={p} type="button" onClick={() => onSay(p)} className="min-h-11 rounded-full border border-line bg-card px-4 text-sm hover:bg-paper-2">
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
