"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { api } from "@/lib/client/api";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const handleClick = async () => {
    await api("/api/v1/auth/signout", { method: "POST" }).catch(() => undefined);
    router.push("/signin");
    router.refresh();
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex min-h-11 items-center gap-4 rounded-xl px-3 text-ink-2 transition hover:bg-paper-2 hover:text-ink"
    >
      <LogOut aria-hidden="true" className="h-5 w-5" />
      <span className={compact ? "sr-only" : "hidden xl:inline"}>Sign out</span>
      {!compact && <span className="sr-only xl:hidden">Sign out</span>}
    </button>
  );
}
