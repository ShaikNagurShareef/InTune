"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { Button } from "./ui";

export function SignOutButton() {
  const router = useRouter();
  const handleClick = async () => {
    await api("/api/v1/auth/signout", { method: "POST" }).catch(() => undefined);
    router.push("/signin");
    router.refresh();
  };
  return (
    <Button tone="ghost" onClick={handleClick}>
      Sign out
    </Button>
  );
}
