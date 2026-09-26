"use client";

import { geminiHeaders } from "./byok";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number, code: string, message: string, retryable: boolean) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  gemini?: boolean;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

const NETWORK_MESSAGE = "You seem to be offline. Nothing was sent; your words are kept here.";

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    ...(opts.gemini ? geminiHeaders() : {}),
    ...(opts.idempotencyKey ? { "idempotency-key": opts.idempotencyKey } : {}),
  };
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      credentials: "same-origin",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "network", NETWORK_MESSAGE, true);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data ?? {}) as { code?: string; safe_message?: string; retryable?: boolean };
    throw new ApiError(res.status, e.code ?? "error", e.safe_message ?? "Something went wrong.", Boolean(e.retryable));
  }
  return data as T;
}

export const fetcher = <T,>(path: string): Promise<T> => api<T>(path);

export function newIdempotencyKey(): string {
  return crypto.randomUUID().replaceAll("-", "");
}
