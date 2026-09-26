"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Per-person values that disappear on their own after a while (live caption lines, signals). */
export function useExpiring<T>(): {
  values: Record<string, T>;
  show: (key: string, value: T, ms: number) => void;
  clear: (key: string) => void;
} {
  const [values, setValues] = useState<Record<string, T>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  const clear = useCallback((key: string) => {
    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    setValues((prev) => (key in prev ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)) : prev));
  }, []);

  const show = useCallback(
    (key: string, value: T, ms: number) => {
      clearTimeout(timers.current.get(key));
      setValues((prev) => ({ ...prev, [key]: value }));
      timers.current.set(key, setTimeout(() => clear(key), ms));
    },
    [clear],
  );

  return { values, show, clear };
}
