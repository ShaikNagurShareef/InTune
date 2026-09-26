import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/server-session";
import { moderationQueue } from "@/lib/services/moderation";
import { PageTitle } from "@/components/ui";
import { ModerationQueue } from "./queue";

export const metadata: Metadata = { title: "Reports" };

export default async function ModerationPage() {
  const user = await requirePageUser("/moderation");
  const reports = await moderationQueue(user.id);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageTitle eyebrow="Circles you own" title="Reports">
        Only content someone chose to report appears here. Reviewing reports never uses AI.
      </PageTitle>
      <ModerationQueue initial={reports.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />
    </div>
  );
}
