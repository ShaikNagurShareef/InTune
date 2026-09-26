import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Settings-style card with an icon heading, used across profile and settings. */
export function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  children,
  tone = "default",
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section aria-labelledby={id} className={`rounded-3xl border bg-card p-6 shadow-[var(--shadow)] ${tone === "danger" ? "border-clay/30" : "border-line"}`}>
      <div className="mb-4 flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${tone === "danger" ? "bg-clay-soft text-clay" : "bg-teal-soft text-teal"}`}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <h2 id={id} className="text-lg font-extrabold">{title}</h2>
          {description && <p className="text-sm text-ink-2">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
