"use client";

import { useSyncExternalStore } from "react";

/**
 * Personal AI keys (Google Gemini and/or OpenAI), kept only in this browser's localStorage. They are sent
 * per request in headers to InTune's own server routes and never stored server-side. Every access is
 * guarded because storage can be unavailable (private windows, blocked site data).
 */
export type AiProviderId = "gemini" | "openai";

const KEYS: Record<AiProviderId, string> = { gemini: "intune.gemini.key", openai: "intune.openai.key" };
const MODELS: Record<AiProviderId, string> = { gemini: "intune.gemini.model", openai: "intune.openai.model" };
const PROVIDER = "intune.ai.provider";
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
    // Storage unavailable: the value simply is not remembered.
  }
  window.dispatchEvent(new Event(EVENT));
}

export const getProvider = (): AiProviderId => (read(PROVIDER) === "openai" ? "openai" : "gemini");
export const setProvider = (p: AiProviderId): void => write(PROVIDER, p);
export const getKey = (p: AiProviderId): string | null => read(KEYS[p]);
export const setKey = (p: AiProviderId, key: string | null): void => write(KEYS[p], key);
export const getModel = (p: AiProviderId): string | null => read(MODELS[p]);
export const setModel = (p: AiProviderId, model: string | null): void => write(MODELS[p], model);

// Back-compat helpers (Gemini).
export const getGeminiKey = (): string | null => getKey("gemini");
export const setGeminiKey = (key: string | null): void => setKey("gemini", key);
export const setGeminiModel = (model: string | null): void => setModel("gemini", model);

export const hasMediaConsent = (): boolean => read(CONSENT) === "gemini-processing-v1";
export const setMediaConsent = (on: boolean): void => write(CONSENT, on ? "gemini-processing-v1" : null);

/** Headers for AI requests: chosen provider, any personal keys, and the chosen provider's model. */
export function geminiHeaders(): Record<string, string> {
  const provider = getProvider();
  const gemini = getKey("gemini");
  const openai = getKey("openai");
  const model = getModel(provider);
  return {
    "x-ai-provider": provider,
    ...(gemini ? { "x-gemini-key": gemini } : {}),
    ...(openai ? { "x-openai-key": openai } : {}),
    ...(model ? { "x-ai-model": model } : {}),
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

/** True when this browser holds a personal key for any provider. Server render assumes none. */
export function useHasGeminiKey(): boolean {
  return useSyncExternalStore(subscribe, () => Boolean(getKey("gemini") || getKey("openai")), () => false);
}

export function useProvider(): AiProviderId {
  return useSyncExternalStore(subscribe, getProvider, () => "gemini");
}

export function useModel(p: AiProviderId): string | null {
  return useSyncExternalStore(subscribe, () => getModel(p), () => null);
}

export function maskKey(key: string): string {
  return key.length <= 8 ? "••••" : `${key.slice(0, 4)}••••••${key.slice(-4)}`;
}

export function useMaskedKey(p: AiProviderId = "gemini"): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      const key = getKey(p);
      return key ? maskKey(key) : null;
    },
    () => null,
  );
}

export function useMediaConsent(): boolean {
  return useSyncExternalStore(subscribe, hasMediaConsent, () => false);
}
