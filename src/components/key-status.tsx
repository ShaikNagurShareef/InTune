"use client";

import Link from "next/link";
import { useHasGeminiKey } from "@/lib/client/byok";

/** Tells the person whether wording help is available on this device. */
export function KeyStatus() {
  const hasKey = useHasGeminiKey();
  return (
    <Link
      href="/settings"
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${
        hasKey ? "border-sage/40 bg-sage-soft" : "border-line bg-paper-2 text-ink-2"
      }`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${hasKey ? "bg-sage" : "bg-ink-2/40"}`} />
      {hasKey ? "Wording help on" : "Wording help off"}
    </Link>
  );
}
