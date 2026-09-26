import { ApiError, GoogleGenAI, type Part } from "@google/genai";
import { z, type ZodType } from "zod";
import { AppError } from "@/lib/errors";
import { e2eStubEnabled, e2eStubTransport } from "./e2e-stub";
import { createHash } from "node:crypto";
import { ATTEMPT_TIMEOUT_MS, DEFAULT_MODEL, MAX_OUTPUT_TOKENS, MAX_TRANSIENT_RETRIES } from "./config";

export const KEY_HEADER = "x-gemini-key";
export const MODEL_HEADER = "x-gemini-model";

// Classic "AIza…" keys and newer dotted "AQ.…" keys; header-safe characters only.
const KEY_PATTERN = /^[A-Za-z0-9._-]{20,256}$/;
const MODEL_PATTERN = /^(models\/)?gemini-[a-z0-9.-]{1,60}$/;

/**
 * Per-request Gemini credentials. Never persisted, logged, or placed in LangGraph config/state.
 * `source` is "user" for a key the person brought (always preferred) or "server" for the operator's shared key.
 */
export interface GeminiCredentials {
  readonly apiKey: string;
  readonly model: string;
  readonly source?: "user" | "server";
  /** True when the person picked a model in Settings; otherwise the best available model is chosen. */
  readonly explicitModel?: boolean;
}

/** The operator's shared key (Vercel env GEMINI_API_KEY), used only when a person hasn't brought their own. */
export function serverKeyAvailable(): boolean {
  return KEY_PATTERN.test(process.env.GEMINI_API_KEY?.trim() ?? "") || e2eStubEnabled();
}

export function credentialsFromRequest(req: Request): GeminiCredentials {
  const requested = req.headers.get(MODEL_HEADER)?.trim();
  const explicitModel = Boolean(requested && MODEL_PATTERN.test(requested));
  const model = explicitModel && requested ? requested.replace(/^models\//, "") : DEFAULT_MODEL;
  const userKey = req.headers.get(KEY_HEADER)?.trim() ?? "";
  if (KEY_PATTERN.test(userKey)) return { apiKey: userKey, model, source: "user", explicitModel };
  const serverKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (KEY_PATTERN.test(serverKey)) return { apiKey: serverKey, model: DEFAULT_MODEL, source: "server" };
  // Playwright only: the scripted stand-in acts as the shared key (never enabled in production).
  if (e2eStubEnabled()) return { apiKey: "e2e-stub-transport", model: DEFAULT_MODEL, source: "server" };
  throw new AppError("ai_key_missing", "AI translation isn't set up yet. Add a Gemini key in Settings — you can still send your own words.");
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
}

/** 2.5 Flash can switch thinking off; newer models think by default, so give them room beyond the visible answer. */
function generationLimits(model: string) {
  if (model.startsWith("gemini-2.5-flash")) return { maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingBudget: 0 } };
  return { maxOutputTokens: MAX_OUTPUT_TOKENS * THINKING_HEADROOM };
}

const THINKING_HEADROOM = 5;
const EXCLUDED_VARIANTS = /(lite|image|tts|live|audio|embedding|exp|preview|thinking|8b)/;

/** Picks the newest stable Flash model this key can call (e.g. gemini-3-flash over gemini-2.5-flash). */
export function pickModel(names: string[]): string | null {
  const flash = names.filter((n) => n.includes("flash") && !EXCLUDED_VARIANTS.test(n));
  const versioned = flash
    .map((n) => ({ n, v: Number(/^gemini-(\d+(?:\.\d+)?)-flash$/.exec(n)?.[1] ?? NaN) }))
    .filter((x) => !Number.isNaN(x.v))
    .sort((a, b) => b.v - a.v);
  return versioned[0]?.n ?? (flash.includes("gemini-flash-latest") ? "gemini-flash-latest" : (flash[0] ?? null));
}

const modelCache = new Map<string, Promise<string>>();

/** Resolves (and caches per key, per server instance) which model to use unless the person chose one. */
async function resolveModel(creds: GeminiCredentials): Promise<string> {
  if (creds.explicitModel) return creds.model;
  const cacheKey = createHash("sha256").update(creds.apiKey).digest("hex");
  let pending = modelCache.get(cacheKey);
  if (!pending) {
    pending = listModels(creds.apiKey)
      .then((names) => pickModel(names) ?? creds.model)
      .catch(() => creds.model);
    modelCache.set(cacheKey, pending);
  }
  return pending;
}

function forgetModel(creds: GeminiCredentials): void {
  modelCache.delete(createHash("sha256").update(creds.apiKey).digest("hex"));
}

const liveTransport: GeminiTransport = {
  async generate(creds, req) {
    const ai = new GoogleGenAI({ apiKey: creds.apiKey });
    const timeout = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
    const model = await resolveModel(creds);
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: req.parts }],
        config: {
          systemInstruction: req.system,
          responseMimeType: "application/json",
          responseJsonSchema: req.jsonSchema,
          temperature: 0.2,
          ...generationLimits(model),
          abortSignal: signal,
        },
      });
      return res.text ?? "";
    } catch (err) {
      // A retired or unavailable model: re-pick on the next attempt.
      if (statusOf(err) === 404) forgetModel(creds);
      throw err;
    }
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

function statusOf(err: unknown): number | null {
  if (err instanceof ApiError) return err.status;
  return null;
}

function isTransient(err: unknown): boolean {
  const status = statusOf(err);
  if (status === null) return err instanceof Error && err.name === "TimeoutError";
  return status === 404 || status === 429 || status >= 500;
}

/** Content-free provider diagnostics: status and Google's error text only, with any key scrubbed. */
function logProviderError(err: unknown): void {
  const status = statusOf(err);
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const scrubbed = raw.replace(/AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z._-]{20,}/g, "<key>").slice(0, 300);
  console.warn(`[gemini] provider error status=${status ?? "none"} ${scrubbed}`);
}

function toAppError(err: unknown): AppError {
  logProviderError(err);
  const status = statusOf(err);
  if (status === 400 || status === 401 || status === 403) {
    return new AppError("ai_key_missing", "Gemini did not accept this API key or model. Check Settings.");
  }
  if (status === 429) return new AppError("rate_limited", "Gemini quota reached. You can still send your own words.");
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
      const backoff = 400 * 2 ** attempt + Math.random() * 300;
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
}

/** Schema-validated call with exactly one bounded repair attempt, then a manual fallback error (NFR05). */
export async function generateJson<T>(
  creds: GeminiCredentials,
  req: Omit<GenerateRequest, "jsonSchema">,
  schema: ZodType<T>,
): Promise<JsonCallResult<T>> {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
  const first = await withRetry(() => activeTransport().generate(creds, { ...req, jsonSchema }), req.signal);
  const parsed = tryParse(first, schema);
  if (parsed) return { data: parsed, repaired: false };

  const repairParts: Part[] = [
    ...req.parts,
    { text: `Your previous reply was not valid JSON for the schema. Reply again with only valid JSON.` },
  ];
  const second = await withRetry(
    () => activeTransport().generate(creds, { ...req, parts: repairParts, jsonSchema }),
    req.signal,
  );
  const repaired = tryParse(second, schema);
  if (repaired) return { data: repaired, repaired: true };
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
