"use client";

import { useEffect } from "react";

/** Applies reading preferences to <html> so they cover every page (FR02). */
export function PrefsApplier({ textSize, reduceMotion, theme }: { textSize: string; reduceMotion: boolean; theme: string }) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.textSize = textSize;
    root.dataset.reduceMotion = String(reduceMotion);
    root.dataset.theme = theme;
  }, [textSize, reduceMotion, theme]);
  return null;
}
