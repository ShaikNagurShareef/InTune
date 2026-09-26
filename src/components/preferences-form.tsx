"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, Notice } from "./ui";
import { speak, useSpeechAvailable } from "./speech";

export interface Prefs {
  inputMode: string;
  textSize: string;
  sentenceLength: string;
  audioRate: number;
  reduceMotion: boolean;
  quietMode: boolean;
  locale: string;
  version: number;
}

type Status = { kind: "idle" | "saved" | "unsaved" } | { kind: "error" | "conflict"; message: string };

const INPUT_MODES = [
  { value: "type", label: "Type" },
  { value: "symbols", label: "Tap phrases" },
  { value: "speak", label: "Speak" },
  { value: "video", label: "Short video" },
];
const TEXT_SIZES = [
  { value: "md", label: "Standard" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
];
const LENGTHS = [
  { value: "short", label: "Short sentences" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Any length" },
];

function Choice({ legend, name, options, value, onChange }: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 font-bold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-4 font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-teal ${
              value === o.value ? "border-teal bg-teal-soft" : "border-line bg-card hover:border-ink-2"
            }`}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PreferencesForm({ initial, afterSave }: { initial: Prefs; afterSave?: string }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const canSpeak = useSpeechAvailable();

  const update = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setStatus({ kind: "unsaved" });
  };

  const save = async () => {
    try {
      const body = {
        expected_version: prefs.version,
        inputMode: prefs.inputMode,
        textSize: prefs.textSize,
        sentenceLength: prefs.sentenceLength,
        audioRate: prefs.audioRate,
        reduceMotion: prefs.reduceMotion,
        quietMode: prefs.quietMode,
        locale: prefs.locale,
      };
      const saved = await api<Prefs>("/api/v1/preferences", { method: "PUT", body });
      setPrefs(saved);
      setStatus({ kind: "saved" });
      if (afterSave) router.push(afterSave);
      router.refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not save.";
      setStatus({ kind: err instanceof ApiError && err.code === "stale_version" ? "conflict" : "error", message });
    }
  };

  const reload = async () => {
    setPrefs(await api<Prefs>("/api/v1/preferences"));
    setStatus({ kind: "idle" });
  };

  const reset = async () => {
    setPrefs(await api<Prefs>("/api/v1/preferences/reset", { method: "POST" }));
    setStatus({ kind: "saved" });
    router.refresh();
  };

  return (
    <div className="space-y-7">
      <Choice legend="How do you usually start a message?" name="inputMode" options={INPUT_MODES} value={prefs.inputMode} onChange={(v) => update("inputMode", v)} />
      <Choice legend="Text size" name="textSize" options={TEXT_SIZES} value={prefs.textSize} onChange={(v) => update("textSize", v)} />
      <Choice legend="Wording help should use" name="sentenceLength" options={LENGTHS} value={prefs.sentenceLength} onChange={(v) => update("sentenceLength", v)} />
      <div>
        <label htmlFor="rate" className="mb-2 block font-bold">
          Speaking speed: {prefs.audioRate.toFixed(2)}×
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="rate"
            type="range"
            min={0.5}
            max={2}
            step={0.25}
            value={prefs.audioRate}
            onChange={(e) => update("audioRate", Number(e.target.value))}
            className="h-11 w-60 accent-[var(--teal)]"
          />
          <Button onClick={() => speak("This is how messages will sound.", prefs.audioRate)} disabled={!canSpeak}>
            ▶ Hear a sample
          </Button>
        </div>
        {!canSpeak && <p className="mt-1 text-sm text-ink-2">This browser has no speech voice. Text stays visible.</p>}
      </div>
      <div className="space-y-3">
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => update("reduceMotion", e.target.checked)} className="h-5 w-5 accent-[var(--teal)]" />
          <span className="font-bold">Reduce motion</span>
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" checked={prefs.quietMode} onChange={(e) => update("quietMode", e.target.checked)} className="h-5 w-5 accent-[var(--teal)]" />
          <span>
            <span className="font-bold">Quiet mode</span> <span className="text-ink-2">— hide unread counts</span>
          </span>
        </label>
        <p className="text-sm text-ink-2">Language: English (the only validated language so far).</p>
      </div>

      <div aria-live="polite">
        {status.kind === "saved" && <Notice tone="ok">Saved.</Notice>}
        {status.kind === "unsaved" && <p className="text-sm font-bold text-clay">Unsaved changes</p>}
        {status.kind === "error" && <Notice tone="warn">{status.message}</Notice>}
        {status.kind === "conflict" && (
          <Notice tone="warn" title="Changed somewhere else">
            {status.message} <button className="font-bold underline" onClick={reload}>Load latest</button>
          </Notice>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button tone="primary" onClick={save}>
          {afterSave ? "Save and continue" : "Save preferences"}
        </Button>
        <Button tone="ghost" onClick={reset}>
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
