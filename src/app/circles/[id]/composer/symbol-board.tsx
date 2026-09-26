"use client";

import { STARTER_PHRASES } from "@/lib/phrases";
import type { PhraseLite } from "../types";

interface Props {
  phrases: PhraseLite[];
  onPick: (label: string) => void;
}

/** Fixed positions: starter phrases first, then the person's own phrases in saved order (FR12). */
export function SymbolBoard({ phrases, onPick }: Props) {
  return (
    <div className="space-y-4">
      <ul aria-label="Starter phrases" className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {STARTER_PHRASES.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p.label)}
              className="flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-xl border border-line bg-card p-2 text-center font-bold shadow-[var(--shadow)] hover:border-teal active:translate-y-px"
            >
              <span aria-hidden="true" className="text-2xl">{p.icon}</span>
              <span className="text-sm leading-tight">{p.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {phrases.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-ink-2">My phrases</h3>
          <ul aria-label="My phrases" className="flex flex-wrap gap-2">
            {phrases.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p.phrase)}
                  title={`Means: ${p.meaning}`}
                  className="min-h-11 rounded-xl border border-teal/30 bg-teal-soft px-3 font-bold hover:border-teal"
                >
                  {p.phrase}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
