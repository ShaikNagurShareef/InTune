"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => undefined;

/** Whether this browser can caption the person's own voice (Chrome, Edge, Safari). */
export function useCaptionsSupported(): boolean {
  return useSyncExternalStore(noopSubscribe, () => recognitionCtor() !== null, () => false);
}

const MAX_BACKOFF_MS = 30_000;
const MAX_FAILURES = 8;

/**
 * Live captions of the local person's speech via the browser's speech recognition. Restarts itself
 * after pauses (backing off when it keeps failing), and stops when `active` turns off (e.g. muted).
 * `onStopped` explains why captions stopped for good (permission blocked or recognition unavailable).
 */
export function useSpeechCaptions(
  active: boolean,
  onResult: (text: string, final: boolean) => void,
  onStopped: (reason: string) => void,
): void {
  const callbacks = useRef({ onResult, onStopped });
  useEffect(() => {
    callbacks.current = { onResult, onStopped };
  }, [onResult, onStopped]);

  useEffect(() => {
    const Ctor = recognitionCtor();
    if (!active || !Ctor) return;
    let stopped = false;
    let failures = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    const start = () => {
      try {
        rec.start();
      } catch {
        // Already starting; the next end event retries.
      }
    };
    rec.onresult = (e) => {
      failures = 0;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.trim();
        if (text) callbacks.current.onResult(text, e.results[i].isFinal);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      failures += 1;
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || failures >= MAX_FAILURES) {
        stopped = true;
        callbacks.current.onStopped(
          e.error === "not-allowed" || e.error === "service-not-allowed"
            ? "Captions are off: this browser blocked speech recognition."
            : "Captions stopped because speech recognition kept failing. Others can still hear you.",
        );
      }
    };
    rec.onend = () => {
      if (stopped) return;
      retry = setTimeout(start, failures === 0 ? 0 : Math.min(1000 * 2 ** (failures - 1), MAX_BACKOFF_MS));
    };
    start();
    return () => {
      stopped = true;
      clearTimeout(retry);
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        // Already stopped.
      }
    };
  }, [active]);
}
