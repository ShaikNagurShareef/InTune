import { ApiError, GoogleGenAI, type Part } from "@google/genai";
import { z, type ZodType } from "zod";
import { AppError } from "@/lib/errors";
import { e2eStubEnabled, e2eStubTransport } from "./e2e-stub";
import { createHash } from "node:crypto";
import { runWithFallback, statusOf as routerStatusOf, type RouteRef } from "./router";
import {
  DEFAULT_OPENAI_MODEL,
  OPENAI_KEY_PATTERN,
  isOpenAiModel,
  listOpenAiModels,
  openAiClient,
  openAiGenerate,
  rankOpenAiModels,
} from "./openai";
import { ATTEMPT_TIMEOUT_MS, DEFAULT_MODEL, MAX_OUTPUT_TOKENS, MAX_TRANSIENT_RETRIES } from "./config";

export const KEY_HEADER = "x-gemini-key";
export const MODEL_HEADER = "x-gemini-model";
export const OPENAI_KEY_HEADER = "x-openai-key";
export const PROVIDER_HEADER = "x-ai-provider";
export const AI_MODEL_HEADER = "x-ai-model";

export type AiProviderId = "gemini" | "openai";

// Classic "AIza…" keys and newer dotted "AQ.…" keys; header-safe characters only.
const KEY_PATTERN = /^[A-Za-z0-9._-]{20,256}$/;
const MODEL_PATTERN = /^(models\/)?gemini-[a-z0-9.-]{1,60}$/;

/**
 * Per-request Gemini credentials. Never persisted, logged, or placed in LangGraph config/state.
 * `source` is "user" for a key the person brought (always preferred) or "server" for the operator's shared key.
 */
export interface GeminiCredentials {
  /** Which AI provider this key belongs to (defaults to Gemini). */
  readonly provider?: AiProviderId;
  readonly apiKey: string;
  readonly model: string;
  readonly source?: "user" | "server";
  /** True when the person picked a model in Settings; otherwise the best available model is chosen. */
  readonly explicitModel?: boolean;
  /** Other keys of the same kind (the person's other own key, or the other shared key) for fallback. */
  readonly alternates?: readonly { provider: AiProviderId; apiKey: string }[];
}

const serverGeminiKey = () => process.env.GEMINI_API_KEY?.trim() ?? "";
const serverOpenAiKey = () => process.env.OPENAI_API_KEY?.trim() ?? "";

/** The operator's shared keys (Vercel env GEMINI_API_KEY / OPENAI_API_KEY), used only without a personal key. */
export function serverKeyAvailable(): boolean {
  return KEY_PATTERN.test(serverGeminiKey()) || OPENAI_KEY_PATTERN.test(serverOpenAiKey()) || e2eStubEnabled();
}

/**
 * Picks credentials for this request. Order: the person's own key for their chosen provider, their other
 * own key, the shared Gemini key, then the shared OpenAI key. Keys are used for this call only.
 */
export function credentialsFromRequest(req: Request): GeminiCredentials {
  const preferred: AiProviderId = req.headers.get(PROVIDER_HEADER)?.trim() === "openai" ? "openai" : "gemini";
  const requested = (req.headers.get(AI_MODEL_HEADER) ?? req.headers.get(MODEL_HEADER))?.trim().replace(/^models\//, "") ?? "";
  const geminiKey = req.headers.get(KEY_HEADER)?.trim() ?? "";
  const openAiKey = req.headers.get(OPENAI_KEY_HEADER)?.trim() ?? "";

  const ownGemini = (): GeminiCredentials => {
    const explicitModel = MODEL_PATTERN.test(requested) && preferred === "gemini";
    return { provider: "gemini", apiKey: geminiKey, model: explicitModel ? requested : DEFAULT_MODEL, source: "user", explicitModel };
  };
  const ownOpenAi = (): GeminiCredentials => {
    const explicitModel = isOpenAiModel(requested) && preferred === "openai";
    return { provider: "openai", apiKey: openAiKey, model: explicitModel ? requested : DEFAULT_OPENAI_MODEL, source: "user", explicitModel };
  };
  const hasGemini = KEY_PATTERN.test(geminiKey);
  const hasOpenAi = OPENAI_KEY_PATTERN.test(openAiKey);
  // A person's own keys fall back to each other, never to the operator's shared key.
  const withOther = (c: GeminiCredentials, other: { provider: AiProviderId; apiKey: string } | null): GeminiCredentials =>
    other ? { ...c, alternates: [other] } : c;
  if (preferred === "openai" && hasOpenAi) return withOther(ownOpenAi(), hasGemini ? { provider: "gemini", apiKey: geminiKey } : null);
  if (preferred === "gemini" && hasGemini) return withOther(ownGemini(), hasOpenAi ? { provider: "openai", apiKey: openAiKey } : null);
  if (hasOpenAi) return ownOpenAi();
  if (hasGemini) return ownGemini();

  const sharedGemini = KEY_PATTERN.test(serverGeminiKey());
  const sharedOpenAi = OPENAI_KEY_PATTERN.test(serverOpenAiKey());
  if (sharedGemini) {
    return withOther(
      { provider: "gemini", apiKey: serverGeminiKey(), model: DEFAULT_MODEL, source: "server" },
      sharedOpenAi ? { provider: "openai", apiKey: serverOpenAiKey() } : null,
    );
  }
  if (sharedOpenAi) {
    return { provider: "openai", apiKey: serverOpenAiKey(), model: DEFAULT_OPENAI_MODEL, source: "server" };
  }
  // Playwright only: the scripted stand-in acts as the shared key (never enabled in production).
  if (e2eStubEnabled()) return { provider: "gemini", apiKey: "e2e-stub-transport", model: DEFAULT_MODEL, source: "server" };
  throw new AppError("ai_key_missing", "AI translation isn't set up yet. Add a Gemini or OpenAI key in Settings — you can still send your own words.");
}

/** Generates structured JSON. Tests replace this through `setGeminiTransport`. */
export interface GeminiTransport {
  generate(creds: GeminiCredentials, req: GenerateRequest): Promise<string>;
}

export interface GenerateRequest {
  system: string;
  parts: Part[];
  jsonSchema: unknown;
  signal?: AbortSignal;
  /** Reports which model actually answered (for honest diagnostics and assist results). */
  onModel?: (model: string) => void;
}

/** 2.5 Flash can switch thinking off; newer models think by default, so give them room beyond the visible answer. */
function generationLimits(model: string) {
  if (model.startsWith("gemini-2.5-flash")) return { maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingBudget: 0 } };
  return { maxOutputTokens: MAX_OUTPUT_TOKENS * THINKING_HEADROOM };
}

const THINKING_HEADROOM = 5;

/**
 * Orders the Flash models a key can call: newest stable version first, then the "latest" alias, then
 * lighter variants as a last resort. Each model has its own capacity and quota, so later entries are
 * fallbacks when one is overloaded (503) or out of quota (429).
 */
export function rankModels(names: string[]): string[] {
  const flash = names.filter((n) => n.includes("flash") && !/(image|tts|live|audio|embedding|exp|preview|thinking|8b)/.test(n));
  const version = (n: string) => Number(/^gemini-(\d+(?:\.\d+)?)-flash/.exec(n)?.[1] ?? NaN);
  const stable = flash
    .filter((n) => /^gemini-\d+(?:\.\d+)?-flash$/.test(n))
    .sort((a, b) => version(b) - version(a));
  const latest = flash.filter((n) => n === "gemini-flash-latest");
  const lite = flash
    .filter((n) => /^gemini-\d+(?:\.\d+)?-flash-lite$/.test(n) || n === "gemini-flash-lite-latest")
    .sort((a, b) => (version(b) || 0) - (version(a) || 0));
  return [...new Set([...stable, ...latest, ...lite])];
}

export function pickModel(names: string[]): string | null {
  return rankModels(names)[0] ?? null;
}

const MAX_MODEL_CANDIDATES = 5;
const modelCache = new Map<string, Promise<string[]>>();
const keyHash = (provider: AiProviderId, apiKey: string) => createHash("sha256").update(`${provider}:${apiKey}`).digest("hex");

/** Candidate models for one key, best first (cached per server instance) unless the person chose one. */
async function resolveModels(provider: AiProviderId, apiKey: string, fallbackModel: string, explicit?: string): Promise<string[]> {
  if (explicit) return [explicit];
  const key = keyHash(provider, apiKey);
  let pending = modelCache.get(key);
  if (!pending) {
    pending = (provider === "openai" ? listOpenAiModels(apiKey) : listModels(apiKey))
      .then((names) => {
        const ranked = (provider === "openai" ? rankOpenAiModels(names) : rankModels(names)).slice(0, MAX_MODEL_CANDIDATES);
        return ranked.length ? ranked : [fallbackModel];
      })
      .catch(() => [fallbackModel]);
    modelCache.set(key, pending);
  }
  return pending;
}

interface Route extends RouteRef {
  apiKey: string;
}

const hasMedia = (parts: Part[]) => parts.some((p) => p.inlineData || p.fileData);

/**
 * Every model we may try for this request: the chosen key's models first, then the alternate key's.
 * Recordings can only go to Gemini (OpenAI receives text; its voice path transcribes separately).
 */
async function routesFor(creds: GeminiCredentials, req: GenerateRequest): Promise<Route[]> {
  const keys = [{ provider: creds.provider ?? "gemini", apiKey: creds.apiKey, primary: true }, ...(creds.alternates ?? []).map((a) => ({ ...a, primary: false }))];
  const routes: Route[] = [];
  for (const k of keys) {
    if (hasMedia(req.parts) && k.provider !== "gemini") continue;
    const fallback = k.provider === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_MODEL;
    const explicit = k.primary && creds.explicitModel ? creds.model : undefined;
    const keyId = keyHash(k.provider, k.apiKey).slice(0, 12);
    for (const model of await resolveModels(k.provider, k.apiKey, fallback, explicit)) {
      routes.push({ provider: k.provider, model, keyId, apiKey: k.apiKey });
    }
  }
  return routes;
}

/** Flattens text parts for providers that take plain text (media is transcribed separately for OpenAI). */
function textOnly(parts: Part[]): string {
  if (hasMedia(parts)) {
    throw new AppError("invalid_input", "This provider can't read recordings directly. Please type or record a voice message.");
  }
  return parts.map((p) => p.text ?? "").join("\n");
}

/** One call to one model. */
async function callRoute(route: Route, req: GenerateRequest): Promise<string> {
  const timeout = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
  if (route.provider === "openai") {
    return openAiGenerate(openAiClient(route.apiKey), route.model, { system: req.system, text: textOnly(req.parts), jsonSchema: req.jsonSchema, signal });
  }
  const res = await new GoogleGenAI({ apiKey: route.apiKey }).models.generateContent({
    model: route.model,
    contents: [{ role: "user", parts: req.parts }],
    config: {
      systemInstruction: req.system,
      responseMimeType: "application/json",
      responseJsonSchema: req.jsonSchema,
      temperature: 0.2,
      ...generationLimits(route.model),
      abortSignal: signal,
    },
  });
  return res.text ?? "";
}

/** Routes each call through healthy models with automatic fallback on rate limits and overload. */
const liveTransport: GeminiTransport = {
  async generate(creds, req) {
    const routes = await routesFor(creds, req);
    const { value, route } = await runWithFallback(routes, (r) => callRoute(r, req), {
      signal: req.signal,
      onFallback: ({ from, failure }) => {
        if (failure.kind === "retired") modelCache.delete(keyHash(from.provider, (from as Route).apiKey));
        console.warn(
          `[ai] fallback from ${from.provider}/${from.model}: ${failure.kind} (status ${failure.status ?? "none"}` +
            `${failure.retryAfterMs ? `, retry after ${Math.round(failure.retryAfterMs / 1000)}s` : ""})`,
        );
      },
    });
    req.onModel?.(route.model);
    return value;
  },
};

let transport: GeminiTransport | null = null;

function activeTransport(): GeminiTransport {
  if (transport) return transport;
  return e2eStubEnabled() ? e2eStubTransport : liveTransport;
}

export function setGeminiTransport(next: GeminiTransport | null): void {
  transport = next;
}

/** HTTP status from either SDK's error (Gemini ApiError, OpenAI APIError). */
function statusOf(err: unknown): number | null {
  if (err instanceof ApiError) return err.status;
  return routerStatusOf(err);
}

/**
 * The router already switches models on rate limits (429). One more full pass only helps for momentary
 * overload (5xx / timeouts), so only those are retried here.
 */
function isTransient(err: unknown): boolean {
  const status = statusOf(err);
  if (status === null) return err instanceof Error && err.name === "TimeoutError";
  return status >= 500;
}

/** Content-free provider diagnostics: status and Google's error text only, with any key scrubbed. */
function logProviderError(err: unknown): void {
  const status = statusOf(err);
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const scrubbed = raw.replace(/AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z._-]{20,}|sk-[0-9A-Za-z_-]{20,}/g, "<key>").slice(0, 300);
  console.warn(`[ai] provider error status=${status ?? "none"} ${scrubbed}`);
}

function toAppError(err: unknown): AppError {
  logProviderError(err);
  const status = statusOf(err);
  if (status === 400 || status === 401 || status === 403) {
    return new AppError("ai_key_missing", "The AI provider did not accept this key or model. Check Settings.");
  }
  if (status === 429) return new AppError("rate_limited", "The AI quota is used up for now. You can still send your own words.");
  return new AppError("ai_unavailable", "Wording help is unavailable right now. You can still send your own words.");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn: () => Promise<string>, signal?: AbortSignal): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (signal?.aborted) throw new AppError("ai_unavailable", "Cancelled.");
      if (attempt >= MAX_TRANSIENT_RETRIES || !isTransient(err)) throw toAppError(err);
      // Overload (503) and quota (429) usually clear within seconds; wait ~1s, then ~2s.
      const backoff = 1000 * 2 ** attempt + Math.random() * 400;
      await sleep(backoff);
    }
  }
}

function tryParse<T>(raw: string, schema: ZodType<T>): T | null {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const result = schema.safeParse(JSON.parse(cleaned));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export interface JsonCallResult<T> {
  data: T;
  repaired: boolean;
  /** The model that actually produced the answer. */
  model: string;
}

/** Schema-validated call with exactly one bounded repair attempt, then a manual fallback error (NFR05). */
export async function generateJson<T>(
  creds: GeminiCredentials,
  req: Omit<GenerateRequest, "jsonSchema">,
  schema: ZodType<T>,
): Promise<JsonCallResult<T>> {
  // Providers accept a plain JSON Schema object; the "$schema" marker is not needed.
  const { $schema: _marker, ...jsonSchema } = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  void _marker;
  let model = creds.model;
  const onModel = (m: string) => {
    model = m;
  };
  const first = await withRetry(() => activeTransport().generate(creds, { ...req, jsonSchema, onModel }), req.signal);
  const parsed = tryParse(first, schema);
  if (parsed) return { data: parsed, repaired: false, model };

  const repairParts: Part[] = [
    ...req.parts,
    { text: `Your previous reply was not valid JSON for the schema. Reply again with only valid JSON.` },
  ];
  const second = await withRetry(
    () => activeTransport().generate(creds, { ...req, parts: repairParts, jsonSchema, onModel }),
    req.signal,
  );
  const repaired = tryParse(second, schema);
  if (repaired) return { data: repaired, repaired: true, model };
  throw new AppError("ai_malformed", "Wording help returned an unusable answer. Please edit your message directly.");
}

/** Lists models for the Settings "Test key" button. */
export async function listModels(apiKey: string): Promise<string[]> {
  if (e2eStubEnabled()) return ["gemini-2.5-flash"];
  const ai = new GoogleGenAI({ apiKey });
  const names: string[] = [];
  try {
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    for await (const m of pager) {
      const actions = m.supportedActions ?? [];
      if (m.name && actions.includes("generateContent") && m.name.includes("gemini")) {
        names.push(m.name.replace(/^models\//, ""));
      }
    }
  } catch (err) {
    throw toAppError(err);
  }
  return names;
}
