import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "primary" | "quiet" | "danger" | "ghost";

const TONES: Record<Tone, string> = {
  primary:
    "bg-teal text-teal-ink shadow-[var(--shadow)] hover:brightness-110 active:translate-y-px disabled:opacity-50",
  quiet: "bg-card text-ink border border-line hover:border-ink-2 active:translate-y-px disabled:opacity-50",
  danger: "bg-card text-clay border border-clay/50 hover:bg-clay-soft active:translate-y-px disabled:opacity-50",
  ghost: "text-ink-2 hover:text-ink hover:bg-paper-2 disabled:opacity-50",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
}

/** 44px minimum target, visible focus, text label always present (spec §2 visual and accessible behaviour). */
export function Button({ tone = "quiet", className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-4 font-bold transition ${TONES[tone]} ${className}`}
      {...rest}
    />
  );
}

type NoticeTone = "info" | "warn" | "ok" | "uncertain";
const NOTICE: Record<NoticeTone, string> = {
  info: "bg-teal-soft text-ink border-teal/30",
  warn: "bg-clay-soft text-ink border-clay/40",
  ok: "bg-sage-soft text-ink border-sage/40",
  uncertain: "bg-amber-soft text-amber-ink border-amber-ink/30",
};
const ICON: Record<NoticeTone, string> = { info: "ℹ️", warn: "⚠️", ok: "✓", uncertain: "?" };

export function Notice({ tone = "info", title, children }: { tone?: NoticeTone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "warn" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 ${NOTICE[tone]}`}>
      <p className="flex gap-2">
        <span aria-hidden="true" className="font-bold">{ICON[tone]}</span>
        <span>
          {title && <strong className="block">{title}</strong>}
          {children}
        </span>
      </p>
    </div>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ai" | "warn" }) {
  const cls =
    tone === "ai"
      ? "bg-teal-soft text-ink border-teal/30"
      : tone === "warn"
        ? "bg-clay-soft text-ink border-clay/40"
        : "bg-paper-2 text-ink-2 border-line";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${cls}`}>{children}</span>;
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="mb-1 text-sm font-bold uppercase tracking-[0.14em] text-teal">{eyebrow}</p>}
      <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-lg text-ink-2">{children}</div>}
    </header>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-xl border border-line bg-card px-3 py-2 text-base text-ink placeholder:text-ink-2/70 focus:border-teal";
