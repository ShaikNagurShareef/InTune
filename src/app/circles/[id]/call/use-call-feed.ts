"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChannel, useLocalParticipant } from "@livekit/components-react";
import type { ReceivedDataMessage } from "@livekit/components-core";
import { speak, stopSpeaking } from "@/components/speech";
import { DATA_TOPIC, MAX_TEXT, decode, encode, type CallData, type SignalKind, type TranscriptEntry } from "./protocol";
import { useExpiring } from "./use-expiring";
import { useInterpreter } from "./use-interpreter";

const MAX_ENTRIES = 200;
const INTERIM_SEND_MS = 350;
const INTERIM_STALE_MS = 5000;
const SIGNAL_SHOW_MS = 20_000;
/** Finished lines from one person faster than this are dropped, so nobody can flood the call. */
const MIN_LINE_GAP_MS = 800;
/** Short replies ("ok", "yes please") are already plain; the interpreter only looks at longer lines. */
const MIN_WORDS_TO_INTERPRET = 4;

export interface LiveCaption {
  name: string;
  text: string;
  mine: boolean;
}

export interface ActiveSignal {
  kind: SignalKind;
  id: string;
}

interface Options {
  callId: string;
  interpreter: boolean;
  readAloud: boolean;
  audioRate: number;
}

type Sender = { identity: string; name: string };

const newId = () => crypto.randomUUID();
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Transcript lines, kept in memory only; ids are scoped by sender so nobody can overwrite another's line. */
function useTranscript() {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const add = useCallback((entry: TranscriptEntry) => {
    setEntries((prev) => (prev.some((e) => e.id === entry.id) ? prev : [...prev, entry].slice(-MAX_ENTRIES)));
  }, []);
  const annotate = useCallback((id: string, interp: TranscriptEntry["interp"]) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, interp } : e)));
  }, []);
  return { entries, add, annotate };
}

/**
 * The call's shared side channel: live captions, "say it for me" lines and one-tap signals travel
 * between participants over LiveKit's data channel. Everything lives in memory and is gone on leave.
 */
export function useCallFeed({ callId, interpreter, readAloud, audioRate }: Options) {
  const { localParticipant } = useLocalParticipant();
  const { entries, add, annotate } = useTranscript();
  const { values: live, show: showLive, clear: clearLive } = useExpiring<LiveCaption>();
  const { values: signals, show: showSignal } = useExpiring<ActiveSignal>();
  const { enqueue, note: interpreterNote } = useInterpreter(callId, interpreter, annotate);
  const [sendProblem, setSendProblem] = useState<string | null>(null);
  const lastLine = useRef(new Map<string, number>());
  const lastInterim = useRef(0);
  const opts = useRef({ readAloud, audioRate });
  useEffect(() => {
    opts.current = { readAloud, audioRate };
  }, [readAloud, audioRate]);
  useEffect(() => stopSpeaking, []);

  const apply = useCallback(
    (d: CallData, from: Sender, mine: boolean) => {
      const id = `${from.identity}:${d.id}`;
      const at = Date.now();
      if (d.t === "caption" && !d.final) return showLive(from.identity, { name: from.name, text: d.text, mine }, INTERIM_STALE_MS);
      if (d.t === "signal") {
        showSignal(from.identity, { kind: d.kind, id }, SIGNAL_SHOW_MS);
        return add({ id, from, mine, kind: "signal", text: d.kind, at });
      }
      if (!mine && at - (lastLine.current.get(from.identity) ?? 0) < MIN_LINE_GAP_MS) return;
      lastLine.current.set(from.identity, at);
      const entry: TranscriptEntry = { id, from, mine, kind: d.t, text: d.text, at };
      add(entry);
      if (d.t === "caption") {
        clearLive(from.identity);
        if (!mine && words(d.text) >= MIN_WORDS_TO_INTERPRET) enqueue(entry);
      } else if (!mine && opts.current.readAloud) {
        speak(`${from.name} says: ${d.text}`, opts.current.audioRate, undefined, true);
      }
    },
    [add, clearLive, enqueue, showLive, showSignal],
  );

  const onMessage = useCallback(
    (msg: ReceivedDataMessage<typeof DATA_TOPIC>) => {
      const d = decode(msg.payload);
      if (d && msg.from) apply(d, { identity: msg.from.identity, name: msg.from.name || "Someone" }, false);
    },
    [apply],
  );
  const { send } = useDataChannel(DATA_TOPIC, onMessage);

  const publish = (d: CallData, reliable: boolean) => {
    send(encode(d), { reliable, topic: DATA_TOPIC }).then(
      () => setSendProblem(null),
      () => setSendProblem("Couldn’t reach the others just now. Check your connection."),
    );
    apply(d, { identity: localParticipant.identity, name: localParticipant.name || "You" }, true);
  };

  const sendCaption = (text: string, final: boolean) => {
    const now = Date.now();
    if (!final && now - lastInterim.current < INTERIM_SEND_MS) return;
    lastInterim.current = now;
    // Interim words may drop without harm; finished lines must arrive.
    publish({ t: "caption", id: newId(), text: text.slice(0, MAX_TEXT), final }, final);
  };

  return {
    entries,
    live,
    signals,
    interpreterNote,
    sendProblem,
    sendCaption,
    sendSay: (text: string) => publish({ t: "say", id: newId(), text: text.slice(0, MAX_TEXT) }, true),
    sendSignal: (kind: SignalKind) => publish({ t: "signal", id: newId(), kind }, true),
    retryInterpret: enqueue,
  };
}

export type CallFeed = ReturnType<typeof useCallFeed>;
