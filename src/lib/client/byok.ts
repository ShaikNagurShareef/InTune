"use client";

import { useSyncExternalStore } from "react";

/**
 * BYOK Gemini key, kept only in this browser's localStorage. It is sent per request in a header to
 * InTune's own server routes and is never stored server-side. Every access is guarded because storage
 * can be unavailable (private windows, blocked site data).
 */
const KEY = "intune.gemini.key";
const MODEL = "intune.gemini.model";
const CONSENT = "intune.media.consent";
const EVENT = "intune-byok-change";

function read(name: string): string | null {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(name);
    else window.localStorage.setItem(name, value);
  } catch {
    // Storage unavailable: the key simply is not remembered.
  }
  window.dispatchEvent(new Event(EVENT));
}

export const getGeminiKey = (): string | null => read(KEY);
export const getGeminiModel = (): string | null => read(MODEL);
export const setGeminiKey = (key: string | null): void => write(KEY, key);
export const setGeminiModel = (model: string | null): void => write(MODEL, model);
export const hasMediaConsent = (): boolean => read(CONSENT) === "gemini-processing-v1";
export const setMediaConsent = (on: boolean): void => write(CONSENT, on ? "gemini-processing-v1" : null);

export function geminiHeaders(): Record<string, string> {
  const key = getGeminiKey();
  const model = getGeminiModel();
  return {
    ...(key ? { "x-gemini-key": key } : {}),
    ...(model ? { "x-gemini-model": model } : {}),
  };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** True when a key is saved in this browser. Server render assumes no key. */
export function useHasGeminiKey(): boolean {
  return useSyncExternalStore(subscribe, () => Boolean(getGeminiKey()), () => false);
}

export function useGeminiModel(): string | null {
  return useSyncExternalStore(subscribe, getGeminiModel, () => null);
}

export function maskKey(key: string): string {
  return key.length <= 8 ? "••••" : `${key.slice(0, 4)}••••••${key.slice(-4)}`;
}

export function useMaskedKey(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      const key = getGeminiKey();
      return key ? maskKey(key) : null;
    },
    () => null,
  );
}

export function useMediaConsent(): boolean {
  return useSyncExternalStore(subscribe, hasMediaConsent, () => false);
}
