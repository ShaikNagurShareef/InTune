"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { CARD_CHIPS } from "@/lib/social";
import { CommCardView } from "@/components/comm-card";
import { Button, Notice, inputClass } from "@/components/ui";

interface Card {
  chips: string[];
  note: string;
}

/** Lets someone tell their circles how communication works best for them (a "communication passport"). */
export function CommCardEditor({ initial, name }: { initial: Card | null; name: string }) {
  const [card, setCard] = useState<Card>(initial ?? { chips: [], note: "" });
  const [status, setStatus] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const toggle = (chip: string) =>
    setCard((c) => ({ ...c, chips: c.chips.includes(chip) ? c.chips.filter((x) => x !== chip) : [...c.chips, chip] }));

  const save = async () => {
    try {
      await api("/api/v1/me/card", { method: "PUT", body: card });
      setStatus({ tone: "ok", text: "Saved. People in your circles can see this." });
    } catch (err) {
      setStatus({ tone: "warn", text: err instanceof ApiError ? err.message : "Couldn't save." });
    }
  };

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 font-bold">Pick what helps you</legend>
        <div className="flex flex-wrap gap-2">
          {CARD_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              aria-pressed={card.chips.includes(chip)}
              onClick={() => toggle(chip)}
              className={`min-h-11 rounded-full border px-3 text-sm font-bold ${
                card.chips.includes(chip) ? "border-teal bg-teal-soft" : "border-line bg-card text-ink-2 hover:border-ink-2"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-1 block font-bold">Anything else, in your words (optional)</span>
        <textarea
          value={card.note}
          onChange={(e) => setCard((c) => ({ ...c, note: e.target.value }))}
          maxLength={280}
          rows={2}
          placeholder="e.g. If I go quiet, I'm not upset — I just need a break."
          className={inputClass}
        />
      </label>
      <div>
        <p className="mb-1 text-sm font-bold text-ink-2">Preview — what your circles see</p>
        <CommCardView name={name} card={card.chips.length || card.note ? card : null} />
        {!card.chips.length && !card.note && <p className="text-sm text-ink-2">Nothing yet — that’s fine too.</p>}
      </div>
      {status && <Notice tone={status.tone}>{status.text}</Notice>}
      <Button tone="primary" onClick={save}>Save card</Button>
    </div>
  );
}
