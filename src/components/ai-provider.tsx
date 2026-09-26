"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useHasGeminiKey } from "@/lib/client/byok";

const ServerAiContext = createContext(false);

/** Tells client components whether the operator's shared Gemini key is configured (never the key itself). */
export function AiProvider({ serverAi, children }: { serverAi: boolean; children: ReactNode }) {
  return <ServerAiContext.Provider value={serverAi}>{children}</ServerAiContext.Provider>;
}

/** AI features work with the person's own key or the shared server key. */
export function useAiAvailable(): boolean {
  const hasOwnKey = useHasGeminiKey();
  const serverAi = useContext(ServerAiContext);
  return hasOwnKey || serverAi;
}

export function useAiSource(): "own" | "shared" | "none" {
  const hasOwnKey = useHasGeminiKey();
  const serverAi = useContext(ServerAiContext);
  if (hasOwnKey) return "own";
  return serverAi ? "shared" : "none";
}
