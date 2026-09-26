/**
 * Multi-model router with automatic fallback (Gemini ⇄ OpenAI, several models each).
 *
 * Each route is one model on one key. When a route is rate-limited (429), overloaded (5xx / timeout) or
 * retired (404), it is benched for a cooldown — honouring the provider's own "retry after" hint when it
 * gives one — and the request moves to the next healthy route. Later requests skip benched routes, so a
 * busy model costs one failed call, not one per request. If every route is benched, the one whose cooldown
 * ends first is tried. Auth and bad-request errors stop immediately (another model won't fix them).
 *
 * Health is kept in memory per server instance: cheap, no content, no keys (only a short key hash).
 */

export type ProviderId = "gemini" | "openai";

export interface RouteRef {
  provider: ProviderId;
  model: string;
  /** Short hash of the API key, so different keys have separate health. Never the key itself. */
  keyId: string;
}

export type FailureKind = "rate_limited" | "overloaded" | "retired" | "fatal";

export interface Failure {
  kind: FailureKind;
  status: number | null;
  retryAfterMs: number | null;
}

const SECOND = 1000;
export const COOLDOWN_MS: Record<Exclude<FailureKind, "fatal">, number> = {
  rate_limited: 60 * SECOND,
  overloaded: 15 * SECOND,
  retired: 60 * 60 * SECOND,
};
const MAX_COOLDOWN_MS = 5 * 60 * SECOND;

interface Health {
  until: number;
  kind: FailureKind;
  failures: number;
}

const registry = new Map<string, Health>();
export const routeKey = (r: RouteRef): string => `${r.provider}:${r.model}:${r.keyId}`;

/** HTTP status from either SDK's error (Gemini ApiError, OpenAI APIError) or anything with a numeric status. */
export function statusOf(err: unknown): number | null {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

/** Reads the provider's own retry hint: OpenAI headers, Gemini RetryInfo, or "retry in 12.3s" text. */
export function retryAfterMs(err: unknown): number | null {
  const headers = (err as { headers?: { get?: (name: string) => string | null } } | null)?.headers;
  const ms = headers?.get?.("retry-after-ms");
  if (ms && Number.isFinite(Number(ms))) return Number(ms);
  const secs = headers?.get?.("retry-after");
  if (secs && Number.isFinite(Number(secs))) return Number(secs) * SECOND;
  const text = err instanceof Error ? err.message : String(err ?? "");
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text) ?? /retry in (\d+(?:\.\d+)?)\s*s/i.exec(text);
  return match ? Math.round(Number(match[1]) * SECOND) : null;
}

export function classify(err: unknown): Failure {
  const status = statusOf(err);
  const hint = retryAfterMs(err);
  if (status === 429) return { kind: "rate_limited", status, retryAfterMs: hint };
  if (status === 404) return { kind: "retired", status, retryAfterMs: null };
  if (status !== null && status >= 500) return { kind: "overloaded", status, retryAfterMs: hint };
  if (status === null && err instanceof Error && (err.name === "TimeoutError" || err.name === "APIConnectionTimeoutError")) {
    return { kind: "overloaded", status, retryAfterMs: null };
  }
  return { kind: "fatal", status, retryAfterMs: null };
}

export function markUnhealthy(r: RouteRef, failure: Failure, now = Date.now()): void {
  if (failure.kind === "fatal") return;
  const previous = registry.get(routeKey(r));
  const base = failure.retryAfterMs ?? COOLDOWN_MS[failure.kind];
  // Repeated failures back off longer, up to a cap.
  const failures = (previous && previous.until > now - COOLDOWN_MS.rate_limited ? previous.failures : 0) + 1;
  const cooldown = Math.min(base * Math.min(failures, 4), failure.kind === "retired" ? COOLDOWN_MS.retired : MAX_COOLDOWN_MS);
  registry.set(routeKey(r), { until: now + cooldown, kind: failure.kind, failures });
}

export function markHealthy(r: RouteRef): void {
  registry.delete(routeKey(r));
}

export function isCooling(r: RouteRef, now = Date.now()): boolean {
  return (registry.get(routeKey(r))?.until ?? 0) > now;
}

/** Healthy routes in their preferred order, then benched routes by soonest recovery. */
export function orderRoutes<T extends RouteRef>(routes: T[], now = Date.now()): T[] {
  const healthy = routes.filter((r) => !isCooling(r, now));
  const cooling = routes
    .filter((r) => isCooling(r, now))
    .sort((a, b) => (registry.get(routeKey(a))?.until ?? 0) - (registry.get(routeKey(b))?.until ?? 0));
  return [...healthy, ...cooling];
}

export interface FallbackEvent {
  from: RouteRef;
  failure: Failure;
}

export interface FallbackResult<T extends RouteRef, R> {
  value: R;
  route: T;
  /** How many routes failed before this one answered. */
  fallbacks: number;
}

/** Tries routes in health order until one answers; benches the ones that are limited or overloaded. */
export async function runWithFallback<T extends RouteRef, R>(
  routes: T[],
  attempt: (route: T) => Promise<R>,
  opts: { signal?: AbortSignal; onFallback?: (event: FallbackEvent) => void; now?: () => number } = {},
): Promise<FallbackResult<T, R>> {
  const now = opts.now ?? Date.now;
  let lastError: unknown = new Error("No AI model available");
  let fallbacks = 0;
  for (const route of orderRoutes(routes, now())) {
    if (opts.signal?.aborted) throw lastError;
    try {
      const value = await attempt(route);
      markHealthy(route);
      return { value, route, fallbacks };
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      const failure = classify(err);
      if (failure.kind === "fatal") throw err;
      markUnhealthy(route, failure, now());
      opts.onFallback?.({ from: route, failure });
      fallbacks += 1;
      lastError = err;
    }
  }
  throw lastError;
}

export interface HealthRow {
  provider: ProviderId;
  model: string;
  kind: FailureKind;
  secondsLeft: number;
}

/** Content-free view of benched models on this server instance (for Diagnostics). */
export function healthSnapshot(now = Date.now()): HealthRow[] {
  return [...registry.entries()]
    .filter(([, h]) => h.until > now)
    .map(([key, h]) => {
      const [provider, model] = key.split(":");
      return { provider: provider as ProviderId, model, kind: h.kind, secondsLeft: Math.ceil((h.until - now) / SECOND) };
    })
    .sort((a, b) => b.secondsLeft - a.secondsLeft);
}

/** Tests only. */
export function resetRouterHealth(): void {
  registry.clear();
}
