import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/server-session";
import { getPreferences } from "@/lib/services/accounts";
import { PreferencesForm } from "@/components/preferences-form";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Your preferences" };

export default async function Onboarding() {
  const user = await requirePageUser("/onboarding");
  const prefs = await getPreferences(user.id);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageTitle eyebrow="Step 1 of 1" title={`Hi ${user.displayName}. How do you like to communicate?`}>
        You can change any of this later. InTune never asks about diagnoses.
      </PageTitle>
      <div className="rounded-2xl border border-line bg-card p-6 shadow-[var(--shadow)]">
        <PreferencesForm initial={prefs} afterSave="/circles" />
      </div>
    </div>
  );
}
