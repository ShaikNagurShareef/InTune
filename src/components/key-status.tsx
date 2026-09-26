"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useAiSource } from "./ai-provider";

/** Whether wording help is available on this device. */
export function KeyStatus() {
  const source = useAiSource();
  const hasKey = source !== "none";
  return (
    <Link
      href="/settings"
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-bold ${
        hasKey ? "bg-teal-soft text-teal" : "bg-paper-2 text-ink-2"
      }`}
    >
      <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
      {hasKey ? "AI translation on" : "AI translation off"}
      <span className="sr-only"> (wording help; open settings)</span>
    </Link>
  );
}
