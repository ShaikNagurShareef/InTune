import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/server-session";
import { AppError } from "@/lib/errors";
import { getPreferences } from "@/lib/services/accounts";
import { getCircle } from "@/lib/services/circles";
import { callsEnabled } from "@/lib/calls/livekit";
import { Notice } from "@/components/ui";
import { CallLoader } from "./call-loader";

export const metadata: Metadata = { title: "Call" };

export default async function CallPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const { id } = await params;
  const { kind } = await searchParams;
  const user = await requirePageUser(`/circles/${id}/call`);
  const circle = await getCircle(user.id, id).catch((err: unknown) => {
    if (err instanceof AppError) notFound();
    throw err;
  });
  if (!callsEnabled()) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4 p-6">
        <Notice title="Calls aren’t set up yet">This server doesn’t have a call service configured. Messages still work as usual.</Notice>
        <Link href={`/circles/${id}`} className="font-bold text-teal underline">
          Back to the chat
        </Link>
      </div>
    );
  }
  const prefs = await getPreferences(user.id);
  const other = circle.kind === "direct" ? circle.members.find((m) => m.id !== user.id) : undefined;
  return (
    <CallLoader
      me={{ id: user.id, displayName: user.displayName }}
      circle={{ id: circle.id, name: circle.name, kind: circle.kind, avatarSeed: other?.id ?? circle.id }}
      kind={kind === "video" ? "video" : "audio"}
      audioRate={prefs.audioRate}
      interpreterByDefault={prefs.autoTranslate}
    />
  );
}
