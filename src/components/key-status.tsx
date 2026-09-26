"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useHasGeminiKey } from "@/lib/client/byok";

/** Whether wording help is available on this device. */
export function KeyStatus() {
  const hasKey = useHasGeminiKey();
  return (
    <Link
      href="/settings"
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-bold ${
        hasKey ? "bg-teal-soft text-teal" : "bg-paper-2 text-ink-2"
      }`}
    >
      <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
      {hasKey ? "AI help on" : "AI help off"}
      <span className="sr-only"> (wording help; open settings)</span>
    </Link>
  );
}
