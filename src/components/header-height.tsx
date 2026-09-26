"use client";

import { useEffect } from "react";

/** Publishes the app header's live height as --app-header-h so full-height chat screens fit exactly. */
export function HeaderHeight() {
  useEffect(() => {
    const header = document.getElementById("app-header");
    if (!header) return;
    const apply = () => document.documentElement.style.setProperty("--app-header-h", `${header.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return null;
}
