import { ApiError, GoogleGenAI, type Part } from "@google/genai";
import { z, type ZodType } from "zod";
import { AppError } from "@/lib/errors";
import { e2eStubEnabled, e2eStubTransport } from "./e2e-stub";
import { ATTEMPT_TIMEOUT_MS, DEFAULT_MODEL, MAX_OUTPUT_TOKENS, MAX_TRANSIENT_RETRIES } from "./config";

export const KEY_HEADER = "x-gemini-key";
export const MODEL_HEADER = "x-gemini-model";

// Classic "AIza…" keys and newer dotted "AQ.…" keys; header-safe characters only.
const KEY_PATTERN = /^[A-Za-z0-9._-]{20,256}$/;
const MODEL_PATTERN = /^(models\/)?gemini-[a-z0-9.-]{1,60}$/;

/** Per-request BYOK credentials. Never persisted, logged, or placed in LangGraph config/state. */
export interface GeminiCredentials {
  readonly apiKey: string;
  readonly model: string;
}

export function credentialsFromRequest(req: Request): GeminiCredentials {
  const apiKey = req.headers.get(KEY_HEADER)?.trim() ?? "";
  if (!KEY_PATTERN.test(apiKey)) {
    throw new AppError(
      "ai_key_missing",
      "Add your Gemini API key in Settings to use wording help. You can still send your own words.",
    );
  }
  const requested = req.headers.get(MODEL_HEADER)?.trim();
  const model = requested && MODEL_PATTERN.test(requested) ? requested.replace(/^models\//, "") : DEFAULT_MODEL;
  return { apiKey, model };
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

function thinkingConfig(model: string) {
  if (model.startsWith("gemini-2.5-flash")) return { thinkingBudget: 0 };
  return undefined;
}

const liveTransport: GeminiTransport = {
  async generate(creds, req) {
    const ai = new GoogleGenAI({ apiKey: creds.apiKey });
    const timeout = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
    const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
    const res = await ai.models.generateContent({
      model: creds.model,
      contents: [{ role: "user", parts: req.parts }],
      config: {
        systemInstruction: req.system,
        responseMimeType: "application/json",
        responseJsonSchema: req.jsonSchema,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        thinkingConfig: thinkingConfig(creds.model),
        abortSignal: signal,
      },
    });
    return res.text ?? "";
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
  return status === 429 || status >= 500;
}

function toAppError(err: unknown): AppError {
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
