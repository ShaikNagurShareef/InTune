"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, Lock, Server, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/client/api";
import { getKey, setKey, setModel, setProvider, useMaskedKey, useModel, useProvider, type AiProviderId } from "@/lib/client/byok";
import { Button, Notice, inputClass } from "@/components/ui";
import { useAiSource } from "@/components/ai-provider";

interface TestResult {
  models: string[];
  recommended: string | null;
}

const PROVIDERS: { id: AiProviderId; label: string; placeholder: string; getKeyUrl: string; getKeyLabel: string; note: string }[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    placeholder: "AIza… or AQ.…",
    getKeyUrl: "https://aistudio.google.com/apikey",
    getKeyLabel: "Google AI Studio",
    note: "Handles text, voice and video messages.",
  },
  {
    id: "openai",
    label: "OpenAI",
    placeholder: "sk-…",
    getKeyUrl: "https://platform.openai.com/api-keys",
    getKeyLabel: "OpenAI dashboard",
    note: "Handles text and voice messages. Video messages need Gemini.",
  },
];

async function testKey(provider: AiProviderId, key: string): Promise<TestResult> {
  const headers: Record<string, string> = { "x-ai-provider": provider, [provider === "openai" ? "x-openai-key" : "x-gemini-key"]: key };
  const res = await fetch("/api/v1/gemini/test", { method: "POST", headers });
  const data = (await res.json()) as TestResult & { safe_message?: string };
  if (!res.ok) throw new ApiError(res.status, "error", data.safe_message ?? "Key check failed.", false);
  return data;
}

function ProviderKey({ provider }: { provider: (typeof PROVIDERS)[number] }) {
  const masked = useMaskedKey(provider.id);
  const model = useModel(provider.id);
  const [draftKey, setDraftKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ tone: "ok" | "warn" | "info"; text: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const run = async (key: string, save: boolean) => {
    setIsTesting(true);
    setStatus({ tone: "info", text: `Checking the key with ${provider.label}…` });
    try {
      const result = await testKey(provider.id, key);
      setModels(result.models);
      if (save) {
        setKey(provider.id, key);
        setProvider(provider.id);
        setDraftKey("");
      }
      setStatus({ tone: "ok", text: `Key works.${save ? ` Saved in this browser only; ${provider.label} will translate for you.` : ""}` });
    } catch (err) {
      setStatus({ tone: "warn", text: err instanceof ApiError ? err.message : "That key didn't work." });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">{provider.note}</p>
      {masked ? (
        <div className="space-y-4">
          <p className="flex flex-wrap items-center gap-2">
            <KeyRound aria-hidden="true" className="h-4 w-4 text-ink-2" />
            Your key: <code className="rounded bg-paper-2 px-2 py-1">{masked}</code>
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Model</span>
            <select value={model ?? ""} onChange={(e) => setModel(provider.id, e.target.value || null)} className={`${inputClass} w-auto`}>
              <option value="">Automatic (best available)</option>
              {[...new Set([...(model ? [model] : []), ...models])].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {models.length === 0 && <span className="mt-1 block text-xs text-ink-2">Press “Test key” to list the models your key can use.</span>}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { const k = getKey(provider.id); if (k) void run(k, false); }} disabled={isTesting}>Test key</Button>
            <Button
              tone="danger"
              onClick={() => {
                setKey(provider.id, null);
                setModel(provider.id, null);
                setModels([]);
                setStatus({ tone: "info", text: "Key removed from this browser." });
              }}
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" /> Remove key
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void run(draftKey.trim(), true); }} className="space-y-3">
          <label className="block">
            <span className="mb-1 block font-bold">Paste your {provider.label} API key (optional)</span>
            <input
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={provider.placeholder}
              className={inputClass}
            />
          </label>
          <Button tone="primary" type="submit" disabled={draftKey.trim().length < 20 || isTesting}>
            {isTesting ? "Checking…" : "Check and save"}
          </Button>
          <p className="text-sm text-ink-2">
            Get a key at{" "}
            <a href={provider.getKeyUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-teal underline">
              {provider.getKeyLabel}
            </a>
            .
          </p>
        </form>
      )}
      {status && <Notice tone={status.tone}>{status.text}</Notice>}
    </div>
  );
}

export function KeySettings() {
  const source = useAiSource();
  const active = useProvider();
  const [shown, setShown] = useState<AiProviderId>(active);
  const current = PROVIDERS.find((p) => p.id === shown) ?? PROVIDERS[0];

  return (
    <div className="space-y-6">
      {source === "shared" && (
        <Notice tone="ok" title="AI translation is on">
          InTune’s built-in AI is active for your account. Adding your own key is optional — it takes priority and uses your own quota.
        </Notice>
      )}
      {source === "none" && (
        <Notice tone="info" title="AI translation is not set up">Add a Gemini or OpenAI key below. Everything else works without one.</Notice>
      )}

      <section className="rounded-3xl border border-line bg-card p-6 shadow-[var(--shadow)]">
        <fieldset>
          <legend className="mb-3 font-extrabold">Which AI translates for you</legend>
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => {
              const isOn = shown === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={isOn}
                  onClick={() => {
                    setShown(p.id);
                    setProvider(p.id);
                  }}
                  className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border text-sm font-bold ${
                    isOn ? "border-teal bg-teal-soft text-teal" : "border-line hover:border-ink-2"
                  }`}
                >
                  {isOn && <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
                  {p.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-2">
            Your own key for the selected provider is used first; if you have none, InTune’s built-in AI is used.
          </p>
        </fieldset>
        <div className="mt-6 border-t border-line pt-6">
          <ProviderKey key={current.id} provider={current} />
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-line bg-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Lock aria-hidden="true" className="h-5 w-5 text-teal" /> Where your key goes</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>Stored only in this browser, on this device.</li>
            <li>Sent with each AI request to InTune’s server, used for that one call, then forgotten.</li>
            <li>Never saved in InTune’s database, logs or workflow checkpoints.</li>
            <li>Remove it here any time. Signing out does not remove it; use “Remove key” on shared computers.</li>
          </ul>
        </div>
        <div className="rounded-3xl border border-line bg-card p-6">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Server aria-hidden="true" className="h-5 w-5 text-ai" /> What the AI receives</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>The words or recording you ask to translate, your chosen style, and matching phrasebook entries.</li>
            <li>For translating a received message, that one message.</li>
            <li>The provider’s own terms apply (Google or OpenAI). Use non-sensitive content until you’ve checked them.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
