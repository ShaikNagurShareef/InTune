"use client";

import { useState } from "react";
import { ApiError } from "@/lib/client/api";
import {
  getGeminiKey,
  setGeminiKey,
  setGeminiModel,
  useGeminiModel,
  useHasGeminiKey,
  useMaskedKey,
} from "@/lib/client/byok";
import { Button, Notice, inputClass } from "@/components/ui";

interface TestResult {
  models: string[];
  recommended: string | null;
}

export function KeySettings() {
  const hasKey = useHasGeminiKey();
  const model = useGeminiModel();
  const [draftKey, setDraftKey] = useState("");
  const masked = useMaskedKey();
  const [status, setStatus] = useState<{ tone: "ok" | "warn" | "info"; text: string } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  const test = async (key: string) => {
    setIsTesting(true);
    setStatus({ tone: "info", text: "Checking the key with Gemini…" });
    try {
      const res = await fetch("/api/v1/gemini/test", { method: "POST", headers: { "x-gemini-key": key } });
      const data = (await res.json()) as TestResult & { safe_message?: string };
      if (!res.ok) throw new ApiError(res.status, "error", data.safe_message ?? "Key check failed.", false);
      setModels(data.models);
      return data;
    } finally {
      setIsTesting(false);
    }
  };

  const save = async () => {
    const key = draftKey.trim();
    try {
      const result = await test(key);
      setGeminiKey(key);
      if (!model && result.recommended) setGeminiModel(result.recommended);
      setDraftKey("");
      setStatus({ tone: "ok", text: `Key works. Saved in this browser only${result.recommended ? `; using ${model ?? result.recommended}` : ""}.` });
    } catch (err) {
      setStatus({ tone: "warn", text: err instanceof ApiError ? err.message : "That key didn't work." });
    }
  };

  const retest = async () => {
    const key = getGeminiKey();
    if (!key) return;
    try {
      await test(key);
      setStatus({ tone: "ok", text: "Key works." });
    } catch (err) {
      setStatus({ tone: "warn", text: err instanceof ApiError ? err.message : "That key didn't work." });
    }
  };

  const clear = () => {
    setGeminiKey(null);
    setGeminiModel(null);
    setModels([]);
    setStatus({ tone: "info", text: "Key removed from this browser. You can still send your own words." });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow)]">
        {hasKey ? (
          <div className="space-y-4">
            <p className="text-lg">
              Saved key: <code className="rounded bg-paper-2 px-2 py-1">{masked}</code>
            </p>
            <label className="block">
              <span className="mb-1 block font-bold">Model</span>
              <select
                value={model ?? ""}
                onChange={(e) => setGeminiModel(e.target.value || null)}
                className={`${inputClass} w-auto`}
              >
                <option value="">Default (gemini-2.5-flash)</option>
                {[...new Set([...(model ? [model] : []), ...models])].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {models.length === 0 && <span className="mt-1 block text-sm text-ink-2">Press “Test key” to list the models your key can use.</span>}
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={retest} disabled={isTesting}>Test key</Button>
              <Button tone="danger" onClick={clear}>Remove key</Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); void save(); }}
            className="space-y-4"
          >
            <label className="block">
              <span className="mb-1 block font-bold">Paste your Gemini API key</span>
              <input
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="AIza…"
                className={inputClass}
              />
            </label>
            <Button tone="primary" type="submit" disabled={draftKey.trim().length < 20 || isTesting}>
              {isTesting ? "Checking…" : "Check and save"}
            </Button>
            <p className="text-sm text-ink-2">
              Get a key at{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="font-bold text-teal underline">
                Google AI Studio
              </a>
              .
            </p>
          </form>
        )}
        {status && <div className="mt-4"><Notice tone={status.tone}>{status.text}</Notice></div>}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">Where your key goes</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
            <li>Stored only in this browser’s local storage, on this device.</li>
            <li>Sent with each wording-help request to InTune’s server, which uses it for that one Gemini call.</li>
            <li>Never saved in InTune’s database, logs or workflow checkpoints, and never in the app’s code.</li>
            <li>Remove it here at any time. Signing out does not remove it; use “Remove key” on shared computers.</li>
          </ul>
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold">What Gemini receives</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
            <li>The words or recording you ask for help with, your wording choice, and phrasebook entries that match.</li>
            <li>For “Make clearer”, the one message you chose.</li>
            <li>
              Google’s terms for your key apply, and they differ between free and paid use.{" "}
              <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" className="font-bold text-teal underline">Read the terms</a>.
              Use non-sensitive content until you’ve checked them.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
