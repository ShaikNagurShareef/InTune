import OpenAI from "openai";
import { ATTEMPT_TIMEOUT_MS, MAX_OUTPUT_TOKENS } from "./config";
import { statusOf } from "./router";

/**
 * Optional extra fallback: Meta Llama through any OpenAI-compatible host (Meta's Llama API, Groq or Together).
 * Only used when the operator sets LLAMA_API_KEY (optionally LLAMA_BASE_URL / LLAMA_MODEL), after Gemini and OpenAI.
 */
export const LLAMA_KEY_PATTERN = /^[A-Za-z0-9|_.:-]{20,300}$/;

interface LlamaHost {
  baseURL: string;
  fallbackModel: string;
}

const HOSTS: Record<"meta" | "groq" | "together", LlamaHost> = {
  meta: { baseURL: "https://api.llama.com/compat/v1/", fallbackModel: "Llama-4-Maverick-17B-128E-Instruct-FP8" },
  groq: { baseURL: "https://api.groq.com/openai/v1", fallbackModel: "meta-llama/llama-4-maverick-17b-128e-instruct" },
  together: { baseURL: "https://api.together.xyz/v1", fallbackModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
};

/** Guesses the host from the key's shape unless LLAMA_BASE_URL says otherwise. */
function hostFor(apiKey: string): LlamaHost {
  const override = process.env.LLAMA_BASE_URL?.trim();
  const guessed = apiKey.startsWith("gsk_") ? HOSTS.groq : /^[a-f0-9]{64}$/.test(apiKey) || apiKey.startsWith("tgp_") ? HOSTS.together : HOSTS.meta;
  return override ? { baseURL: override, fallbackModel: guessed.fallbackModel } : guessed;
}

export const defaultLlamaModel = (apiKey: string): string => process.env.LLAMA_MODEL?.trim() || hostFor(apiKey).fallbackModel;

export function llamaClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, baseURL: hostFor(apiKey).baseURL, maxRetries: 0, timeout: ATTEMPT_TIMEOUT_MS });
}

/** Newest, largest instruction-tuned Llama chat models first; each is a fallback for the one before. */
export function rankLlamaModels(ids: string[]): string[] {
  const chat = ids.filter((id) => /llama/i.test(id) && !/(guard|vision|embed|prompt-guard|tool-use|8b|1b|3b)/i.test(id));
  const score = (id: string) => {
    const lower = id.toLowerCase();
    if (lower.includes("llama-4-maverick")) return 0;
    if (lower.includes("llama-4-scout")) return 1;
    if (/llama-?3\.3-70b/.test(lower)) return 2;
    if (lower.includes("70b")) return 3;
    return 4;
  };
  return [...chat].sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}

export async function listLlamaModels(apiKey: string): Promise<string[]> {
  const ids: string[] = [];
  for await (const m of llamaClient(apiKey).models.list()) ids.push(m.id);
  return ids;
}

export interface LlamaRequest {
  system: string;
  text: string;
  jsonSchema: unknown;
  signal?: AbortSignal;
}

async function complete(client: OpenAI, model: string, req: LlamaRequest, strictSchema: boolean): Promise<string> {
  const system = strictSchema ? req.system : `${req.system}\nReply with one JSON object only, matching this JSON schema:\n${JSON.stringify(req.jsonSchema)}`;
  const res = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: req.text },
      ],
      response_format: strictSchema
        ? { type: "json_schema", json_schema: { name: "intune_response", schema: req.jsonSchema as Record<string, unknown>, strict: false } }
        : { type: "json_object" },
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
    },
    { signal: req.signal },
  );
  return res.choices[0]?.message?.content ?? "";
}

/** Structured JSON from Llama. Hosts that don't take JSON schemas (400) get plain JSON mode with the schema in the prompt. */
export async function llamaGenerate(client: OpenAI, model: string, req: LlamaRequest): Promise<string> {
  try {
    return await complete(client, model, req, true);
  } catch (err) {
    if (statusOf(err) !== 400) throw err;
    return complete(client, model, req, false);
  }
}
