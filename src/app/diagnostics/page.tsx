import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/server-session";
import { notFound } from "next/navigation";
import { canViewDiagnostics, diagnosticsSummary } from "@/lib/services/diagnostics";
import { DEFAULT_MODEL, PROMPT_VERSION } from "@/lib/gemini/config";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Diagnostics" };
export const dynamic = "force-dynamic";

const ms = (n: number) => `${(n / 1000).toFixed(1)} s`;

export default async function DiagnosticsPage() {
  const user = await requirePageUser("/diagnostics");
  if (!canViewDiagnostics(user.email)) notFound();
  const d = await diagnosticsSummary();
  const tiles = [
    { label: "Assisted turns", value: String(d.assistLatency.n) },
    { label: "Assist p50", value: ms(d.assistLatency.p50) },
    { label: "Assist p95", value: ms(d.assistLatency.p95) },
    { label: "Approvals", value: String(d.counts.approval_created ?? 0) },
    { label: "Approvals rejected", value: String(d.counts.approval_rejected ?? 0) },
    { label: "Sends", value: String(d.counts.send ?? 0) },
  ];
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <PageTitle eyebrow="Last 7 days · all users · no message content" title="Diagnostics">
        Default model <code>{DEFAULT_MODEL}</code> · prompt version <code>{PROMPT_VERSION}</code>. Users may choose another model in Settings.
      </PageTitle>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-card p-4">
            <dt className="text-sm text-ink-2">{t.label}</dt>
            <dd className="font-display text-3xl font-semibold">{t.value}</dd>
          </div>
        ))}
      </dl>
      <h2 className="font-display mt-10 text-2xl font-semibold">Model calls by workflow node</h2>
      <table className="mt-3 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-sm text-ink-2">
            <th className="py-2">Node</th><th>Calls</th><th>p50</th><th>p95</th><th>Needed JSON repair</th>
          </tr>
        </thead>
        <tbody>
          {d.modelCalls.length === 0 && (
            <tr><td colSpan={5} className="py-3 text-ink-2">No calls yet.</td></tr>
          )}
          {d.modelCalls.map((m) => (
            <tr key={m.node} className="border-b border-line">
              <td className="py-2 font-bold">{m.node}</td><td>{m.n}</td><td>{ms(m.p50)}</td><td>{ms(m.p95)}</td><td>{m.repaired}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="font-display mt-10 text-2xl font-semibold">Assist outcomes</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {Object.entries(d.outcomes).map(([k, v]) => (
          <li key={k} className="rounded-full bg-paper-2 px-3 py-1">{k}: <strong>{v}</strong></li>
        ))}
        {Object.keys(d.outcomes).length === 0 && <li className="text-ink-2">None yet.</li>}
      </ul>
    </div>
  );
}
