"use client";

import dynamic from "next/dynamic";

// Client-only: WebRTC, camera preview and speech APIs exist only in the browser.
export const CallLoader = dynamic(() => import("./call-client").then((m) => m.CallClient), {
  ssr: false,
  loading: () => <p className="m-auto text-ink-2">Getting the call ready…</p>,
});
