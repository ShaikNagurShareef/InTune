import { beforeEach, describe, expect, it } from "vitest";
import { classify, healthSnapshot, isCooling, resetRouterHealth, runWithFallback, type RouteRef } from "@/lib/gemini/router";

const route = (model: string, provider: "gemini" | "openai" = "gemini"): RouteRef => ({ provider, model, keyId: "k1" });
const httpError = (status: number, message = "", headers?: Record<string, string>) =>
  Object.assign(new Error(message), { status, headers: headers ? new Headers(headers) : undefined });

describe("model router: automatic fallback", () => {
  beforeEach(resetRouterHealth);

  it("classifies provider errors and reads their retry hints", () => {
    expect(classify(httpError(429, '{"error":{"details":[{"retryDelay":"23s"}]}}'))).toMatchObject({ kind: "rate_limited", retryAfterMs: 23_000 });
    expect(classify(httpError(429, "Rate limit", { "retry-after": "7" }))).toMatchObject({ kind: "rate_limited", retryAfterMs: 7_000 });
    expect(classify(httpError(429, "Please retry in 4.5s."))).toMatchObject({ retryAfterMs: 4_500 });
    expect(classify(httpError(503, "high demand"))).toMatchObject({ kind: "overloaded" });
    expect(classify(httpError(404))).toMatchObject({ kind: "retired" });
    expect(classify(httpError(401))).toMatchObject({ kind: "fatal" });
  });

  it("falls back to the next model when one is rate-limited, and remembers it", async () => {
    const a = route("gemini-3.8-flash");
    const b = route("gemini-3.6-flash");
    const c = route("gpt-5-mini", "openai");
    const tried: string[] = [];
    const attempt = async (r: RouteRef) => {
      tried.push(r.model);
      if (r.model === a.model) throw httpError(429, "quota", { "retry-after": "30" });
      return `answer from ${r.model}`;
    };
    const first = await runWithFallback([a, b, c], attempt);
    expect(first).toMatchObject({ value: "answer from gemini-3.6-flash", fallbacks: 1 });
    expect(isCooling(a)).toBe(true);

    // The next request goes straight to the healthy model — no wasted call on the benched one.
    tried.length = 0;
    await runWithFallback([a, b, c], attempt);
    expect(tried).toEqual(["gemini-3.6-flash"]);
    expect(healthSnapshot()[0]).toMatchObject({ model: "gemini-3.8-flash", kind: "rate_limited" });
  });

  it("crosses providers when every model of the first is limited or overloaded", async () => {
    const routes = [route("gemini-3.8-flash"), route("gemini-3.6-flash"), route("gpt-5-mini", "openai")];
    const res = await runWithFallback(routes, async (r) => {
      if (r.provider === "gemini") throw httpError(r.model.endsWith("8-flash") ? 429 : 503);
      return "ok";
    });
    expect(res.route.provider).toBe("openai");
    expect(res.fallbacks).toBe(2);
  });

  it("when everything is benched, tries the route that recovers soonest", async () => {
    const slow = route("gemini-3.8-flash");
    const fast = route("gemini-3.6-flash");
    await runWithFallback([slow, fast], async (r) => {
      throw httpError(r === slow ? 429 : 503);
    }).catch(() => undefined);
    const tried: string[] = [];
    await runWithFallback([slow, fast], async (r) => {
      tried.push(r.model);
      return "ok";
    });
    expect(tried).toEqual(["gemini-3.6-flash"]);
  });

  it("stops immediately on auth errors (another model won't fix a bad key)", async () => {
    const tried: string[] = [];
    await expect(
      runWithFallback([route("a"), route("b")], async (r) => {
        tried.push(r.model);
        throw httpError(401);
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(tried).toEqual(["a"]);
  });

  it("a success clears the model's bench", async () => {
    const a = route("gemini-3.8-flash");
    await runWithFallback([a, route("b")], async (r) => {
      if (r === a) throw httpError(503);
      return "ok";
    });
    expect(isCooling(a)).toBe(true);
    await runWithFallback([a], async () => "ok", { now: () => Date.now() + 60_000 });
    expect(isCooling(a)).toBe(false);
  });
});
