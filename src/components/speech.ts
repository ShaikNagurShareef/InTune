"use client";

import { useSyncExternalStore } from "react";

/** Device text-to-speech (FR23). Never autoplays; callers invoke it from a button. */
export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export function speak(text: string, rate: number, onEnd?: () => void): boolean {
  if (!speechAvailable()) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.lang = "en";
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  window.speechSynthesis.speak(utterance);
  return true;
}

const noopSubscribe = () => () => undefined;

/** Hydration-safe: the server assumes no voice, the browser reports the real value after hydration. */
export function useSpeechAvailable(): boolean {
  return useSyncExternalStore(noopSubscribe, speechAvailable, () => false);
}
