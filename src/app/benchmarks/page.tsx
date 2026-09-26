import type { Metadata } from "next";
import report from "../../../eval/reports/latest.json";
import manifest from "../../../eval/manifest.json";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Evaluation" };

interface Ratio {
  hit: number;
  total: number;
  rate: number | null;
}

interface Run {
  baseline: string;
  split: string;
  model: string;
  prompt_version: string;
  ran_at: string;
  metrics: {
    cases: number;
    errors: number;
    critical_keep: Ratio;
    negation_preserved_or_queried: Ratio;
    clarification_recall: Ratio;
    unnecessary_clarification: Ratio;
    clear_input_coverage: Ratio;
    forbidden_content: Ratio;
    invented_slots: Ratio;
    latency_ms: { n: number; p50: number; p95: number };
  };
}

const ROWS: { key: keyof Run["metrics"]; label: string; target: string; lowerIsBetter?: boolean }[] = [
  { key: "critical_keep", label: "Critical details kept (names, dates, numbers, negation, conditions)", target: "100% of critical fixtures kept or queried" },
  { key: "negation_preserved_or_queried", label: "“No / not” preserved or asked about", target: "100%" },
  { key: "clarification_recall", label: "Asked when meaning was genuinely missing", target: "≥ 90%" },
  { key: "unnecessary_clarification", label: "Asked when the message was already clear", target: "≤ 15%", lowerIsBetter: true },
  { key: "clear_input_coverage", label: "Drafted clear messages without asking", target: "≥ 80%" },
  { key: "forbidden_content", label: "Obeyed injected text or added forbidden content", target: "0%", lowerIsBetter: true },
  { key: "invented_slots", label: "Invented a number or time", target: "0%", lowerIsBetter: true },
];

function cell(r: Ratio | undefined) {
  if (!r || r.total === 0) return <span className="text-ink-2">—</span>;
  return (
    <span>
      <strong className="font-display text-xl">{Math.round((r.rate ?? 0) * 100)}%</strong>
      <span className="ml-1 text-sm text-ink-2">({r.hit}/{r.total})</span>
    </span>
  );
}

export default function BenchmarksPage() {
  const runs = report.runs as Run[];
  const splits = ["dev", "heldout"] as const;
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <PageTitle eyebrow="Reproducible, with raw counts" title="Evaluation">
        {report.disclosure}
      </PageTitle>

      {runs.length === 0 && <p className="text-lg">No runs yet. See “How to reproduce” below.</p>}

      {splits.map((split) => {
        const splitRuns = runs.filter((r) => r.split === split).sort((a, b) => a.baseline.localeCompare(b.baseline));
        if (!splitRuns.length) return null;
        return (
          <section key={split} className="mb-12" aria-labelledby={`h-${split}`}>
            <h2 id={`h-${split}`} className="font-display text-3xl font-semibold">
              {split === "dev" ? "Development set" : "Held-out set"}{" "}
              <span className="text-lg text-ink-2">({splitRuns[0].metrics.cases} cases)</span>
            </h2>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-card">
              <table className="w-full min-w-[40rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line text-sm text-ink-2">
                    <th className="p-3">Check</th>
                    <th className="p-3">Target</th>
                    {splitRuns.map((r) => (
                      <th key={r.baseline} className="p-3">
                        <span className="block font-bold text-ink">{r.baseline}</span>
                        <span className="text-xs">{r.model}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.key} className="border-b border-line last:border-0">
                      <td className="p-3">{row.label}</td>
                      <td className="p-3 text-sm text-ink-2">{row.target}</td>
                      {splitRuns.map((r) => (
                        <td key={r.baseline} className="p-3">{cell(r.metrics[row.key] as Ratio)}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="p-3">Latency p50 / p95 per case</td>
                    <td className="p-3 text-sm text-ink-2">text p95 ≤ 6 s</td>
                    {splitRuns.map((r) => (
                      <td key={r.baseline} className="p-3 text-sm">
                        {r.metrics.latency_ms.n ? `${(r.metrics.latency_ms.p50 / 1000).toFixed(1)} s / ${(r.metrics.latency_ms.p95 / 1000).toFixed(1)} s` : "—"}
                        {r.metrics.errors > 0 && <span className="block text-clay">{r.metrics.errors} errors</span>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">What the baselines are</h2>
          <dl className="mt-3 space-y-2">
            {Object.entries(manifest.baselines).map(([k, v]) => (
              <div key={k}><dt className="inline font-bold">{k}: </dt><dd className="inline text-ink-2">{v}</dd></div>
            ))}
          </dl>
          <h2 className="font-display mt-8 text-2xl font-semibold">How to reproduce</h2>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-paper-2 p-4 text-sm">{`GEMINI_API_KEY=… npm run eval -- --baseline B2 --split dev
npm run eval -- --baseline B0 --split heldout`}</pre>
          <p className="mt-2 text-sm text-ink-2">
            Fixture file hash <code className="break-all">{manifest.custom_fixtures.sha256.slice(0, 16)}…</code>. Prompts are frozen before held-out runs.
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">Limits of these numbers</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-2">
            <li>{manifest.judging}</li>
            <li>B0 scores well on “kept details” only because it changes nothing; it also never asks and ignores phrasebook meanings.</li>
            {manifest.custom_fixtures.not_included.map((n) => <li key={n.family}>{n.family}: {n.reason}</li>)}
            {manifest.public_datasets.map((d) => <li key={d.name}>{d.name} — {d.status}: {d.reason}</li>)}
          </ul>
        </div>
      </section>
    </div>
  );
}
