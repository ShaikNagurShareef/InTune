import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/server-session";
import { PageTitle } from "@/components/ui";
import { KeySettings } from "./key-settings";

export const metadata: Metadata = { title: "Gemini key" };

export default async function SettingsPage() {
  await requirePageUser("/settings");
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageTitle eyebrow="AI help · bring your own key" title="Gemini API key">
        Wording help, transcription and “Make clearer” use Google Gemini with your own key. Everything else works without one.
      </PageTitle>
      <KeySettings />
    </div>
  );
}
