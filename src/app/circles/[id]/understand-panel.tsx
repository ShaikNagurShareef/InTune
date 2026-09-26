"use client";

export interface ReadingAid {
  messageVersion: number;
  simplifiedText: string;
  warnings: string[];
  summary: { asking: string; replyExpected: "yes" | "no" | "unclear"; unclear: string } | null;
}

const REPLY_LABEL = {
  yes: { text: "Yes, they’re asking something", tone: "bg-teal-soft" },
  no: { text: "No reply needed", tone: "bg-sage-soft" },
  unclear: { text: "Not sure — you could ask them", tone: "bg-amber-soft" },
} as const;

/**
 * Private reading help for the recipient (FR24): what is being asked, whether a reply is expected,
 * what is unclear, and a simpler version. It never guesses feelings; ambiguity is stated, not resolved.
 */
export function UnderstandPanel({ aid }: { aid: ReadingAid }) {
  const s = aid.summary;
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-teal/30 bg-card p-3 text-base">
      <p className="text-xs font-bold uppercase tracking-wider text-teal">Help me understand · AI-assisted · only you see this</p>
      {s && (
        <dl className="grid gap-2">
          {s.asking && (
            <div>
              <dt className="text-xs font-bold text-ink-2">What they’re asking</dt>
              <dd className="font-bold">{s.asking}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-bold text-ink-2">Reply needed?</dt>
            <dd>
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm font-bold ${REPLY_LABEL[s.replyExpected].tone}`}>
                {REPLY_LABEL[s.replyExpected].text}
              </span>
            </dd>
          </div>
          {s.unclear && (
            <div>
              <dt className="text-xs font-bold text-ink-2">What’s unclear</dt>
              <dd className="text-amber-ink">{s.unclear}</dd>
            </div>
          )}
        </dl>
      )}
      <div>
        <p className="text-xs font-bold text-ink-2">Simpler version</p>
        <p className="whitespace-pre-wrap break-words">{aid.simplifiedText}</p>
      </div>
      {aid.warnings.map((w) => (
        <p key={w} className="rounded-lg bg-clay-soft px-2 py-1 text-sm">{w}</p>
      ))}
    </div>
  );
}
