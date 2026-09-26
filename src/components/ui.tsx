import { AlertTriangle, CheckCircle2, CircleHelp, Info, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "primary" | "quiet" | "danger" | "ghost";

const TONES: Record<Tone, string> = {
  primary: "bg-brand text-white shadow-[var(--shadow)] hover:brightness-110 active:scale-[0.98] disabled:opacity-40",
  quiet: "bg-paper-2 text-ink hover:brightness-95 active:scale-[0.98] disabled:opacity-40",
  danger: "text-clay border border-clay/40 hover:bg-clay-soft active:scale-[0.98] disabled:opacity-40",
  ghost: "text-ink-2 hover:text-ink hover:bg-paper-2 disabled:opacity-40",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
}

/** 44px minimum target, visible focus, text label always present (spec §2 visual and accessible behaviour). */
export function Button({ tone = "quiet", className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition ${TONES[tone]} ${className}`}
      {...rest}
    />
  );
}

type NoticeTone = "info" | "warn" | "ok" | "uncertain";
const NOTICE: Record<NoticeTone, string> = {
  info: "bg-teal-soft text-ink border-transparent",
  warn: "bg-clay-soft text-ink border-transparent",
  ok: "bg-sage-soft text-ink border-transparent",
  uncertain: "bg-amber-soft text-amber-ink border-transparent",
};
const ICON: Record<NoticeTone, LucideIcon> = { info: Info, warn: AlertTriangle, ok: CheckCircle2, uncertain: CircleHelp };
const ICON_COLOR: Record<NoticeTone, string> = { info: "text-teal", warn: "text-clay", ok: "text-sage", uncertain: "text-amber-ink" };

export function Notice({ tone = "info", title, children }: { tone?: NoticeTone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "warn" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm ${NOTICE[tone]}`}>
      <p className="flex gap-2.5">
        {(() => {
          const Icon = ICON[tone];
          return <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_COLOR[tone]}`} />;
        })()}
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
      <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-lg text-ink-2">{children}</div>}
    </header>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-xl border border-line bg-paper-2 px-3 py-2 text-base text-ink outline-none placeholder:text-ink-2/70 focus:border-teal focus:bg-card";
