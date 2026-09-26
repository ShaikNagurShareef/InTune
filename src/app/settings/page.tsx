import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/server-session";
import { PageTitle } from "@/components/ui";
import { KeySettings } from "./key-settings";

export const metadata: Metadata = { title: "Gemini key" };

export default async function SettingsPage() {
  await requirePageUser("/settings");
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageTitle eyebrow="AI translation" title="AI settings">
        Translation, transcription and plain-words reading help use Google Gemini or OpenAI. Use InTune’s built-in AI, or your own key.
      </PageTitle>
      <KeySettings />
    </div>
  );
}
