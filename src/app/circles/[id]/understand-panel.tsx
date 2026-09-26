"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CircleHelp, Lightbulb, MessageSquareReply, Target, TextQuote } from "lucide-react";

export interface ReadingAid {
  messageVersion: number;
  simplifiedText: string;
  warnings: string[];
  summary: { asking: string; replyExpected: "yes" | "no" | "unclear"; unclear: string } | null;
}

const REPLY = {
  yes: { text: "Yes — they’re asking something", cls: "bg-teal-soft text-teal" },
  no: { text: "No reply needed", cls: "bg-sage-soft text-sage" },
  unclear: { text: "Not sure — you could ask them", cls: "bg-amber-soft text-amber-ink" },
} as const;

function Row({ icon: Icon, label, children }: { icon: typeof Target; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" />
      <div className="min-w-0">
        <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-2">{label}</dt>
        <dd className="mt-0.5">{children}</dd>
      </div>
    </div>
  );
}

/**
 * Private reading help for the recipient (FR24): what is being asked, whether a reply is expected,
 * what is unclear, and a simpler version. It never guesses feelings; ambiguity is stated, not resolved.
 */
export function UnderstandPanel({ aid }: { aid: ReadingAid }) {
  const s = aid.summary;
  return (
    <section aria-label="Help me understand" className="mt-2 overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)]">
      <header className="bg-brand-soft flex items-center gap-2 px-4 py-2 text-xs font-bold">
        <Lightbulb aria-hidden="true" className="h-4 w-4 text-teal" />
        Help me understand
        <span className="ml-auto font-semibold text-ink-2">AI-assisted · only you see this</span>
      </header>
      <dl className="space-y-3 p-4">
        {s?.asking && (
          <Row icon={Target} label="What they’re asking">
            <span className="font-bold">{s.asking}</span>
          </Row>
        )}
        {s && (
          <Row icon={MessageSquareReply} label="Reply needed?">
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${REPLY[s.replyExpected].cls}`}>
              {REPLY[s.replyExpected].text}
            </span>
          </Row>
        )}
        {s?.unclear && (
          <Row icon={CircleHelp} label="What’s unclear">
            <span className="text-amber-ink">{s.unclear}</span>
          </Row>
        )}
        <Row icon={TextQuote} label="Simpler version">
          <span className="font-read">{aid.simplifiedText}</span>
        </Row>
        {aid.warnings.map((w) => (
          <p key={w} className="flex items-start gap-2 rounded-xl bg-clay-soft px-3 py-2 text-sm">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-clay" />
            {w}
          </p>
        ))}
      </dl>
    </section>
  );
}
