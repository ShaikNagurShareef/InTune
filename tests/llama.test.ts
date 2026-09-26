import { afterEach, describe, expect, it } from "vitest";
import type OpenAI from "openai";
import { credentialsFromRequest } from "@/lib/gemini/client";
import { llamaGenerate, rankLlamaModels } from "@/lib/gemini/llama";

const GEMINI_KEY = "AIzaSyTestTestTestTestTestTestTest000";
const LLAMA_KEY = "LLM|1234567890|abcdefghijklmnopqrstuv";
const saved = { ...process.env };
const noHeaders = () => new Request("http://x");

/** A stand-in for the OpenAI-compatible client that records requests and replays scripted answers. */
function fakeClient(answers: (Error | string)[]) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    chat: {
      completions: {
        create: async (body: Record<string, unknown>) => {
          calls.push(body);
          const next = answers.shift();
          if (next instanceof Error) throw next;
          return { choices: [{ message: { content: next } }] };
        },
      },
    },
  } as unknown as OpenAI;
  return { client, calls };
}

describe("optional Llama provider", () => {
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is only a last fallback after the existing shared keys, and off without a key", () => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.LLAMA_API_KEY;
    expect(credentialsFromRequest(noHeaders()).alternates).toBeUndefined();

    process.env.LLAMA_API_KEY = LLAMA_KEY;
    const creds = credentialsFromRequest(noHeaders());
    expect(creds.provider).toBe("gemini");
    expect(creds.alternates).toEqual([{ provider: "llama", apiKey: LLAMA_KEY }]);

    delete process.env.GEMINI_API_KEY;
    expect(credentialsFromRequest(noHeaders())).toMatchObject({ provider: "llama", source: "server" });
  });

  it("prefers the newest large instruction models and skips guard and tiny models", () => {
    expect(
      rankLlamaModels(["Llama-3.3-8B-Instruct", "Llama-Guard-4-12B", "Llama-3.3-70B-Instruct", "Llama-4-Scout-17B-16E-Instruct-FP8", "Llama-4-Maverick-17B-128E-Instruct-FP8"]),
    ).toEqual(["Llama-4-Maverick-17B-128E-Instruct-FP8", "Llama-4-Scout-17B-16E-Instruct-FP8", "Llama-3.3-70B-Instruct"]);
  });

  it("asks for schema JSON, and falls back to plain JSON mode on hosts that reject schemas", async () => {
    const rejected = Object.assign(new Error("response_format not supported"), { status: 400 });
    const { client, calls } = fakeClient([rejected, '{"ok":true}']);
    const out = await llamaGenerate(client, "llama-3.3-70b-versatile", { system: "Be plain.", text: "hi", jsonSchema: { type: "object" } });
    expect(out).toBe('{"ok":true}');
    expect((calls[0].response_format as { type: string }).type).toBe("json_schema");
    expect((calls[1].response_format as { type: string }).type).toBe("json_object");
    expect(JSON.stringify(calls[1].messages)).toContain("matching this JSON schema");
  });

  it("does not hide real failures such as rate limits", async () => {
    const limited = Object.assign(new Error("slow down"), { status: 429 });
    const { client, calls } = fakeClient([limited]);
    await expect(llamaGenerate(client, "m", { system: "s", text: "t", jsonSchema: {} })).rejects.toBe(limited);
    expect(calls).toHaveLength(1);
  });
});
