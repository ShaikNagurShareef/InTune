"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { api } from "@/lib/client/api";
import { STATUSES, statusInfo } from "@/lib/social";

/**
 * Your energy status (shown to people who share a circle with you). A compact menu button so the
 * chat list stays calm; Escape or clicking outside closes it.
 */
export function StatusMenu({ initial }: { initial: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = statusInfo(status);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setIsOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [isOpen]);

  const choose = async (id: string) => {
    const previous = status;
    setStatus(id);
    setIsOpen(false);
    await api("/api/v1/me/status", { method: "PUT", body: { status: id } }).catch(() => setStatus(previous));
    router.refresh();
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((v) => !v)}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${
          current.id === "none" ? "border-line text-ink-2" : "border-transparent bg-amber-soft text-amber-ink"
        }`}
      >
        <span aria-hidden="true">{current.id === "none" ? "🟢" : current.icon}</span>
        {current.id === "none" ? "Set a status" : current.label}
        <ChevronDown aria-hidden="true" className="h-4 w-4" />
        <span className="sr-only"> (visible to people in your circles)</span>
      </button>
      {isOpen && (
        <ul role="menu" className="absolute left-0 z-20 mt-2 w-64 rounded-2xl border border-line bg-card p-1.5 shadow-[var(--shadow-lg)]">
          {STATUSES.map((s) => (
            <li key={s.id} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={status === s.id}
                onClick={() => choose(s.id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-paper-2"
              >
                <span aria-hidden="true" className="w-5 text-center">{s.id === "none" ? "🟢" : s.icon}</span>
                <span className="flex-1 font-semibold">{s.id === "none" ? "Available" : s.label}</span>
                {status === s.id && <Check aria-hidden="true" className="h-4 w-4 text-teal" />}
              </button>
            </li>
          ))}
          <li role="none" className="px-3 pb-1 pt-2 text-xs text-ink-2">Only people in your circles see this.</li>
        </ul>
      )}
    </div>
  );
}
