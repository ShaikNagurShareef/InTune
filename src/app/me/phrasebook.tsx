"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, Notice, inputClass } from "@/components/ui";

interface Entry {
  id: string;
  phrase: string;
  meaning: string;
  example: string | null;
  revision: number;
}

function EntryForm({ entry, onSave, onCancel }: {
  entry?: Entry;
  onSave: (v: { phrase: string; meaning: string; example: string | null }) => Promise<void>;
  onCancel?: () => void;
}) {
  const submit = async (form: FormData) => {
    const example = String(form.get("example") ?? "").trim();
    await onSave({ phrase: String(form.get("phrase") ?? ""), meaning: String(form.get("meaning") ?? ""), example: example || null });
  };
  return (
    <form action={submit} className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-bold">When I say</span>
          <input name="phrase" required maxLength={120} defaultValue={entry?.phrase} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">I mean</span>
          <input name="meaning" required maxLength={500} defaultValue={entry?.meaning} className={inputClass} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Example (optional)</span>
        <input name="example" maxLength={500} defaultValue={entry?.example ?? ""} className={inputClass} />
      </label>
      <div className="flex gap-2">
        <Button tone="primary" type="submit">{entry ? "Save changes" : "Add phrase"}</Button>
        {onCancel && <Button tone="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

export function Phrasebook({ initial }: { initial: Entry[] }) {
  const [entries, setEntries] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const guard = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That didn't work.");
    }
  };

  return (
    <div className="space-y-4">
      {error && <Notice tone="warn">{error}</Notice>}
      {entries.length === 0 && <p className="text-ink-2">No phrases yet.</p>}
      <ul className="divide-y divide-line">
        {entries.map((e) => (
          <li key={e.id} className="py-3">
            {editing === e.id ? (
              <EntryForm
                entry={e}
                onCancel={() => setEditing(null)}
                onSave={(v) => guard(async () => {
                  const saved = await api<Entry>(`/api/v1/phrases/${e.id}`, { method: "PATCH", body: { ...v, expected_revision: e.revision } });
                  setEntries((list) => list.map((x) => (x.id === e.id ? saved : x)));
                  setEditing(null);
                })}
              />
            ) : (
              <div className="flex flex-wrap items-start gap-2">
                <div className="flex-1">
                  <p><strong>“{e.phrase}”</strong> → {e.meaning}</p>
                  {e.example && <p className="text-sm text-ink-2">e.g. {e.example}</p>}
                </div>
                <Button tone="ghost" className="text-sm" onClick={() => setEditing(e.id)}>Edit</Button>
                <Button
                  tone="ghost"
                  className="text-sm text-clay"
                  onClick={() => guard(async () => {
                    await api(`/api/v1/phrases/${e.id}`, { method: "DELETE" });
                    setEntries((list) => list.filter((x) => x.id !== e.id));
                  })}
                >
                  Delete
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <details className="rounded-xl border border-line p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-bold">Add a phrase</summary>
        <EntryForm
          onSave={(v) => guard(async () => {
            const saved = await api<Entry>("/api/v1/phrases", { body: v });
            setEntries((list) => [...list, saved]);
          })}
        />
      </details>
    </div>
  );
}
