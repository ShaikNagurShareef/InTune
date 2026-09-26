import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display mb-2 text-4xl font-semibold">Welcome back</h1>
      <p className="mb-8 text-ink-2">For adults who choose communication support, and the people they talk with.</p>
      <div className="rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow)]">
        <Suspense>
          <AuthForm mode="signin" />
        </Suspense>
      </div>
    </div>
  );
}
