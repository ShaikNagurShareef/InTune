import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/server-session";
import { AppError } from "@/lib/errors";
import { getPreferences } from "@/lib/services/accounts";
import { getCircle } from "@/lib/services/circles";
import { listMessages } from "@/lib/services/messages";
import { listPhrases } from "@/lib/services/phrasebook";
import { storageMode } from "@/lib/media/storage";
import { CircleView } from "./circle-view";

export const metadata: Metadata = { title: "Circle" };

export default async function CirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/circles/${id}`);
  const circle = await getCircle(user.id, id).catch((err: unknown) => {
    if (err instanceof AppError) notFound();
    throw err;
  });
  const [prefs, page, phrases] = await Promise.all([
    getPreferences(user.id),
    listMessages(user.id, id, null),
    listPhrases(user.id),
  ]);
  return (
    <CircleView
      me={{ id: user.id, displayName: user.displayName }}
      circle={circle}
      initialPage={page}
      prefs={{ inputMode: prefs.inputMode, audioRate: prefs.audioRate, autoTranslate: prefs.autoTranslate }}
      phrases={phrases.map((p) => ({ id: p.id, phrase: p.phrase, meaning: p.meaning }))}
      uploadMode={storageMode()}
    />
  );
}
