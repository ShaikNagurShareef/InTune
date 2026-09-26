"use client";

import { useEffect } from "react";

/** Applies reading preferences to <html> so they cover every page (FR02). */
export function PrefsApplier({ textSize, reduceMotion }: { textSize: string; reduceMotion: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.textSize = textSize;
    root.dataset.reduceMotion = String(reduceMotion);
  }, [textSize, reduceMotion]);
  return null;
}
