"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, Notice, inputClass } from "./ui";

type Mode = "signin" | "signup";

/** Only same-origin paths; rejects "//host", "/\\host" and control characters (open-redirect guard). */
function safeNext(raw: string | null, fallback: string): string {
  if (!raw || !raw.startsWith("/") || /[\\\u0000-\u001f]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsBusy(true);
    setError(null);
    try {
      const body =
        mode === "signup"
          ? { email: form.get("email"), password: form.get("password"), displayName: form.get("displayName") }
          : { email: form.get("email"), password: form.get("password") };
      await api(`/api/v1/auth/${mode}`, { body });
      const fallback = mode === "signup" ? "/onboarding" : "/circles";
      router.push(safeNext(params.get("next"), fallback));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setIsBusy(false);
    }
  };

  const isSignup = mode === "signup";
  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate={false}>
      {error && <Notice tone="warn">{error}</Notice>}
      {isSignup && (
        <label className="block">
          <span className="mb-1 block font-bold">Name people in your circles will see</span>
          <input name="displayName" required maxLength={60} autoComplete="nickname" className={inputClass} />
        </label>
      )}
      <label className="block">
        <span className="mb-1 block font-bold">Email</span>
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
      </label>
      <label className="block">
        <span className="mb-1 block font-bold">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={isSignup ? 8 : 1}
          autoComplete={isSignup ? "new-password" : "current-password"}
          className={inputClass}
          aria-describedby={isSignup ? "pw-hint" : undefined}
        />
        {isSignup && <span id="pw-hint" className="mt-1 block text-sm text-ink-2">At least 8 characters.</span>}
      </label>
      <Button tone="primary" type="submit" disabled={isBusy} className="w-full">
        {isBusy ? "One moment…" : isSignup ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-ink-2">
        {isSignup ? "Already have an account? " : "New here? "}
        <Link
          href={`${isSignup ? "/signin" : "/signup"}${params.get("next") ? `?next=${encodeURIComponent(params.get("next") ?? "")}` : ""}`}
          className="font-bold text-teal underline underline-offset-4"
        >
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
