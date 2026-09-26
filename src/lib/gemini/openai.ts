import OpenAI, { toFile } from "openai";
import { AppError } from "@/lib/errors";
import { ATTEMPT_TIMEOUT_MS, MAX_OUTPUT_TOKENS } from "./config";

/** OpenAI secret keys ("sk-…", "sk-proj-…"); header-safe characters only. */
export const OPENAI_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{20,300}$/;
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_MODEL_PATTERN = /^(gpt|o)[a-z0-9.-]{1,60}$/;
export const isOpenAiModel = (model: string): boolean => OPENAI_MODEL_PATTERN.test(model);

const REASONING_HEADROOM = 5;
const TRANSCRIBE_MODELS = ["gpt-4o-mini-transcribe", "whisper-1"];

/** Reasoning models (gpt-5*, o-series) reject temperature and spend tokens thinking before answering. */
const isReasoning = (model: string) => /^(gpt-5|o\d)/.test(model);

/**
 * Orders chat models a key can call: newest numbered "-mini" first (e.g. gpt-5-mini), then gpt-4o-mini.
 * Later entries are fallbacks when one model is overloaded or out of quota.
 */
export function rankOpenAiModels(ids: string[]): string[] {
  const usable = ids.filter((id) => !/(audio|realtime|search|transcribe|tts|image|embedding|instruct|preview|codex|nano)/.test(id));
  const version = (id: string) => Number(/^gpt-(\d+(?:\.\d+)?)-mini$/.exec(id)?.[1] ?? NaN);
  const minis = usable.filter((id) => !Number.isNaN(version(id))).sort((a, b) => version(b) - version(a));
  const fallback = usable.filter((id) => id === "gpt-4o-mini");
  return [...new Set([...minis, ...fallback])];
}

export function openAiClient(apiKey: string, fetchImpl?: typeof fetch): OpenAI {
  return new OpenAI({ apiKey, maxRetries: 0, timeout: ATTEMPT_TIMEOUT_MS, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
}

export async function listOpenAiModels(apiKey: string): Promise<string[]> {
  const ids: string[] = [];
  for await (const m of openAiClient(apiKey).models.list()) ids.push(m.id);
  return ids;
}

export interface OpenAiRequest {
  system: string;
  text: string;
  jsonSchema: unknown;
  signal?: AbortSignal;
}

/** One structured-JSON chat completion. The schema guides output; InTune still validates with Zod. */
export async function openAiGenerate(client: OpenAI, model: string, req: OpenAiRequest): Promise<string> {
  const reasoning = isReasoning(model);
  const res = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.text },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "intune_response", schema: req.jsonSchema as Record<string, unknown>, strict: false },
      },
      max_completion_tokens: reasoning ? MAX_OUTPUT_TOKENS * REASONING_HEADROOM : MAX_OUTPUT_TOKENS,
      ...(reasoning ? { reasoning_effort: "low" as const } : { temperature: 0.2 }),
    },
    { signal: req.signal },
  );
  return res.choices[0]?.message?.content ?? "";
}

/** Speech-to-text for voice messages when OpenAI is the provider. Video needs Gemini. */
export async function openAiTranscribe(apiKey: string, bytes: Buffer, mime: string, kind: string): Promise<string> {
  if (kind === "video") {
    throw new AppError("invalid_input", "Video messages need Google Gemini. Record a voice message or type instead.");
  }
  const client = openAiClient(apiKey);
  const extension = mime.includes("mp4") ? "m4a" : mime.includes("mpeg") || mime.includes("mp3") ? "mp3" : mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : "webm";
  let lastError: unknown = null;
  for (const model of TRANSCRIBE_MODELS) {
    try {
      const file = await toFile(bytes, `recording.${extension}`, { type: mime });
      const res = await client.audio.transcriptions.create({ file, model });
      return res.text.trim();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
