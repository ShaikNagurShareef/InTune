import { HeartHandshake } from "lucide-react";
import { statusInfo } from "@/lib/social";

interface CardProps {
  name: string;
  card: { chips: string[]; note: string } | null;
  status?: string;
}

/** "How to talk with me": written by the person, shown to people who share a circle with them. */
export function CommCardView({ name, card, status }: CardProps) {
  const s = statusInfo(status ?? "none");
  if (!card && s.id === "none") return null;
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-paper-2/70 p-4">
      {s.id !== "none" && (
        <p className="text-sm font-bold">
          <span aria-hidden="true">{s.icon} </span>
          {s.label}
        </p>
      )}
      {card && (
        <>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal">
            <HeartHandshake aria-hidden="true" className="h-4 w-4" /> How to talk with {name}
          </p>
          {card.chips.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {card.chips.map((c) => (
                <li key={c} className="rounded-full border border-line bg-card px-3 py-1 text-sm font-semibold">{c}</li>
              ))}
            </ul>
          )}
          {card.note && <p className="text-sm">“{card.note}”</p>}
        </>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = statusInfo(status ?? "none");
  if (s.id === "none") return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-xs font-bold text-amber-ink">
      <span aria-hidden="true">{s.icon}</span>
      {s.short}
    </span>
  );
}
