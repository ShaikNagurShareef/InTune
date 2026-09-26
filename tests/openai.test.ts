import { describe, expect, it } from "vitest";
import { credentialsFromRequest } from "@/lib/gemini/client";
import { openAiClient, openAiGenerate, rankOpenAiModels } from "@/lib/gemini/openai";

const OPENAI_KEY = "sk-proj-testtesttesttesttesttest0000";
const GEMINI_KEY = "AIzaSyTestTestTestTestTestTestTest000";

describe("OpenAI provider", () => {
  it("ranks the newest -mini chat model first and skips non-chat variants", () => {
    expect(
      rankOpenAiModels(["gpt-4o-mini", "gpt-4.1-mini", "gpt-5-mini", "gpt-5-nano", "gpt-4o-mini-transcribe", "gpt-4o-realtime-preview", "gpt-5"]),
    ).toEqual(["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"]);
  });

  it("uses the person's chosen provider first, then their other key, then the server key", () => {
    const req = (h: Record<string, string>) => new Request("http://x", { headers: h });
    expect(credentialsFromRequest(req({ "x-ai-provider": "openai", "x-openai-key": OPENAI_KEY, "x-gemini-key": GEMINI_KEY }))).toMatchObject({
      provider: "openai",
      source: "user",
    });
    expect(credentialsFromRequest(req({ "x-ai-provider": "gemini", "x-openai-key": OPENAI_KEY, "x-gemini-key": GEMINI_KEY }))).toMatchObject({
      provider: "gemini",
    });
    expect(credentialsFromRequest(req({ "x-ai-provider": "gemini", "x-openai-key": OPENAI_KEY }))).toMatchObject({ provider: "openai" });
    expect(credentialsFromRequest(req({ "x-ai-provider": "openai", "x-openai-key": OPENAI_KEY, "x-ai-model": "gpt-4.1-mini" }))).toMatchObject({
      model: "gpt-4.1-mini",
      explicitModel: true,
    });

    const previous = process.env.OPENAI_API_KEY;
    const previousGemini = process.env.GEMINI_API_KEY;
    try {
      delete process.env.GEMINI_API_KEY;
      process.env.OPENAI_API_KEY = OPENAI_KEY;
      expect(credentialsFromRequest(req({}))).toMatchObject({ provider: "openai", source: "server" });
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
      if (previousGemini !== undefined) process.env.GEMINI_API_KEY = previousGemini;
    }
  });

  it("sends a JSON-schema chat request and returns the model's JSON", async () => {
    const seen: Record<string, unknown>[] = [];
    const fakeFetch: typeof fetch = async (_url, init) => {
      seen.push(JSON.parse(String(init?.body)));
      const body = {
        id: "x",
        object: "chat.completion",
        created: 0,
        model: "gpt-5-mini",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"draft_text":"I will leave at 3."}' } }],
      };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    const client = openAiClient(OPENAI_KEY, fakeFetch);
    const out = await openAiGenerate(client, "gpt-5-mini", { system: "sys", text: "leave 3", jsonSchema: { type: "object" } });
    expect(out).toBe('{"draft_text":"I will leave at 3."}');
    expect(seen[0]).toMatchObject({
      model: "gpt-5-mini",
      response_format: { type: "json_schema" },
      reasoning_effort: "low",
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "leave 3" }],
    });
    expect(seen[0]).not.toHaveProperty("temperature");

    await openAiGenerate(client, "gpt-4o-mini", { system: "s", text: "t", jsonSchema: {} });
    expect(seen[1]).toMatchObject({ temperature: 0.2 });
    expect(seen[1]).not.toHaveProperty("reasoning_effort");
  });
});

describe("fallback keys", () => {
  const req = (h: Record<string, string>) => new Request("http://x", { headers: h });
  it("a person's own keys back each other up, but never fall back to the shared key", () => {
    const both = credentialsFromRequest(req({ "x-ai-provider": "gemini", "x-gemini-key": GEMINI_KEY, "x-openai-key": OPENAI_KEY }));
    expect(both).toMatchObject({ provider: "gemini", alternates: [{ provider: "openai", apiKey: OPENAI_KEY }] });
    const previous = process.env.OPENAI_API_KEY;
    try {
      process.env.OPENAI_API_KEY = "sk-sharedsharedsharedshared0000";
      expect(credentialsFromRequest(req({ "x-gemini-key": GEMINI_KEY })).alternates).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previous;
    }
  });

  it("shared Gemini falls back to shared OpenAI when both are configured", () => {
    const prev = { g: process.env.GEMINI_API_KEY, o: process.env.OPENAI_API_KEY };
    try {
      process.env.GEMINI_API_KEY = "AIzaSySharedSharedSharedSharedShared0";
      process.env.OPENAI_API_KEY = "sk-sharedsharedsharedshared0000";
      expect(credentialsFromRequest(req({}))).toMatchObject({
        provider: "gemini",
        source: "server",
        alternates: [{ provider: "openai" }],
      });
    } finally {
      for (const [k, v] of [["GEMINI_API_KEY", prev.g], ["OPENAI_API_KEY", prev.o]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
