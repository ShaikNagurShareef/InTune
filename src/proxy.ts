import { NextResponse, type NextRequest } from "next/server";

/** LiveKit signalling (wss) and API (https) hosts, including LiveKit Cloud's regional hosts. */
function liveKitSources(): string {
  const raw = process.env.LIVEKIT_URL;
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const http = u.protocol === "wss:" ? "https:" : "http:";
    // LiveKit Cloud hands out regional hosts at runtime, so its domain is allowed as a whole; scripts stay nonce-locked.
    const cloud = u.hostname.endsWith(".livekit.cloud") ? " wss://*.livekit.cloud https://*.livekit.cloud" : "";
    return ` ${u.protocol}//${u.host} ${http}//${u.host}${cloud}`;
  } catch {
    return "";
  }
}

/** Per-request nonce CSP for pages (SEC07). API routes return JSON only and get static headers from next.config. */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Style attributes from React are allowed; scripts are the XSS surface and stay nonce-locked.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' https://vercel.com https://*.blob.vercel-storage.com${liveKitSources()}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
