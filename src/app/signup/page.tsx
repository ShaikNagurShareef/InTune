import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { DemoAccounts } from "@/components/demo-accounts";
import { Logo } from "@/components/logo";
import { PhoneMock } from "@/components/phone-mock";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-10 lg:grid-cols-[1fr_400px]">
      <div className="hidden lg:block">
        <PhoneMock />
      </div>
      <div className="space-y-4">
        <div className="rounded-3xl border border-line bg-card p-8 shadow-[var(--shadow)]">
          <div className="mb-6 text-center">
            <Logo size="lg" />
            <h1 className="mt-4 text-xl font-extrabold">Create your account</h1>
            <p className="mt-1 text-sm text-ink-2">Private circles. Your words, approved by you.</p>
          </div>
          <Suspense>
            <AuthForm mode="signup" />
          </Suspense>
        </div>
        <DemoAccounts />
      </div>
    </div>
  );
}
