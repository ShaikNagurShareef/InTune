import { and, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";

/** Restricted page (spec §10): only emails listed in DIAGNOSTICS_EMAILS (comma-separated). */
export function canViewDiagnostics(email: string): boolean {
  const allowed = (process.env.DIAGNOSTICS_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface DiagnosticsSummary {
  windowDays: number;
  counts: Record<string, number>;
  modelCalls: { node: string; n: number; p50: number; p95: number; repaired: number }[];
  assistLatency: { n: number; p50: number; p95: number };
  outcomes: Record<string, number>;
}

/** Aggregate, content-free metrics for the restricted diagnostics page (spec §10). */
export async function diagnosticsSummary(): Promise<DiagnosticsSummary> {
  const since = new Date(Date.now() - WINDOW_MS);
  const recent = and(gt(auditEvents.createdAt, since));
  const counts = await db()
    .select({ kind: auditEvents.kind, n: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(recent)
    .groupBy(auditEvents.kind);
  const modelCalls = await db()
    .select({
      node: sql<string>`${auditEvents.meta}->>'node'`,
      n: sql<number>`count(*)::int`,
      p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by (${auditEvents.meta}->>'ms')::float), 0)`,
      p95: sql<number>`coalesce(percentile_cont(0.95) within group (order by (${auditEvents.meta}->>'ms')::float), 0)`,
      repaired: sql<number>`count(*) filter (where ${auditEvents.meta}->>'repaired' = 'true')::int`,
    })
    .from(auditEvents)
    .where(and(recent, sql`${auditEvents.kind} = 'model_call'`))
    .groupBy(sql`${auditEvents.meta}->>'node'`);
  const [latency] = await db()
    .select({
      n: sql<number>`count(*)::int`,
      p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by (${auditEvents.meta}->>'ms')::float), 0)`,
      p95: sql<number>`coalesce(percentile_cont(0.95) within group (order by (${auditEvents.meta}->>'ms')::float), 0)`,
    })
    .from(auditEvents)
    .where(and(recent, sql`${auditEvents.kind} = 'assist_outcome'`));
  const outcomes = await db()
    .select({ outcome: sql<string>`${auditEvents.meta}->>'outcome'`, n: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(and(recent, sql`${auditEvents.kind} = 'assist_outcome'`))
    .groupBy(sql`${auditEvents.meta}->>'outcome'`);
  return {
    windowDays: 7,
    counts: Object.fromEntries(counts.map((c) => [c.kind, Number(c.n)])),
    modelCalls: modelCalls.map((m) => ({ ...m, n: Number(m.n), p50: Number(m.p50), p95: Number(m.p95), repaired: Number(m.repaired) })),
    assistLatency: { n: Number(latency?.n ?? 0), p50: Number(latency?.p50 ?? 0), p95: Number(latency?.p95 ?? 0) },
    outcomes: Object.fromEntries(outcomes.map((o) => [o.outcome ?? "unknown", Number(o.n)])),
  };
}
