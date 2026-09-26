import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/server-session";
import { AppError } from "@/lib/errors";
import { previewInvite, type InvitePreview } from "@/lib/services/invites";
import { InviteDecision } from "./invite-decision";

export const metadata: Metadata = { title: "Invitation", referrer: "no-referrer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requirePageUser(`/invite/${token}`);
  let preview: InvitePreview | null = null;
  let problem: string | null = null;
  try {
    preview = await previewInvite(token.slice(0, 100), user);
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    problem = err.message;
  }
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      {preview ? (
        <InviteDecision token={token} preview={preview} />
      ) : (
        <div className="rounded-2xl border border-line bg-card p-6">
          <h1 className="font-display text-3xl font-semibold">This link doesn’t work any more</h1>
          <p className="mt-3 text-ink-2">{problem}</p>
        </div>
      )}
    </div>
  );
}
