"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { STATUSES } from "@/lib/social";

/** Your energy status, shown to people who share a circle with you. One tap to set or clear. */
export function StatusPicker({ initial }: { initial: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const choose = async (id: string) => {
    setStatus(id);
    await api("/api/v1/me/status", { method: "PUT", body: { status: id } }).catch(() => setStatus(status));
    router.refresh();
  };
  return (
    <div role="group" aria-label="Your status" className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm font-bold text-ink-2">Your status:</span>
      {STATUSES.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-pressed={status === s.id}
          onClick={() => choose(s.id)}
          className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm font-bold ${
            status === s.id ? "border-teal bg-teal-soft" : "border-line bg-card text-ink-2 hover:border-ink-2"
          }`}
        >
          {s.icon && <span aria-hidden="true">{s.icon}</span>}
          {s.id === "none" ? "Available" : s.short}
        </button>
      ))}
    </div>
  );
}
