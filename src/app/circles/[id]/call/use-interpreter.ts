"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { Interpretation, TranscriptEntry } from "./protocol";

/** In a busy call, only the most recent lines wait; older ones are skipped rather than piling up. */
const MAX_WAITING = 5;

type Update = (id: string, interp: TranscriptEntry["interp"]) => void;

/**
 * Explains other people's lines one at a time with the ✨ interpreter. Stops (and cancels the request
 * in flight) when the interpreter is turned off or the person leaves, so no AI quota is spent afterwards.
 */
export function useInterpreter(callId: string, enabled: boolean, update: Update) {
  const [note, setNote] = useState<string | null>(null);
  const waiting = useRef<TranscriptEntry[]>([]);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const on = useRef(enabled);

  useEffect(() => {
    on.current = enabled;
    if (!enabled) {
      waiting.current = [];
      controller.current?.abort();
    }
  }, [enabled]);

  useEffect(
    () => () => {
      on.current = false;
      waiting.current = [];
      controller.current?.abort();
    },
    [],
  );

  const explain = useCallback(
    async (entry: TranscriptEntry) => {
      controller.current = new AbortController();
      update(entry.id, "loading");
      try {
        const result = await api<Interpretation>(`/api/v1/calls/${callId}/interpret`, {
          body: { utterance: entry.text, speaker: entry.from.name },
          gemini: true,
          signal: controller.current.signal,
        });
        update(entry.id, result);
        setNote(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return update(entry.id, undefined);
        update(entry.id, "error");
        setNote(err instanceof Error ? err.message : "The interpreter is busy. Captions still work.");
      }
    },
    [callId, update],
  );

  const pump = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    for (let next = waiting.current.shift(); next && on.current; next = waiting.current.shift()) {
      await explain(next);
    }
    busy.current = false;
  }, [explain]);

  const enqueue = useCallback(
    (entry: TranscriptEntry) => {
      if (!on.current) return;
      waiting.current = [...waiting.current, entry].slice(-MAX_WAITING);
      void pump();
    },
    [pump],
  );

  return { enqueue, note };
}
