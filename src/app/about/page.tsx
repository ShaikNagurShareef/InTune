import type { Metadata } from "next";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Scope and limits" };

const BUILT = [
  "Accounts, preferences, private circles (up to 20), single-use invitations, membership, ownership transfer",
  "Typed messages, 12 starter phrases plus your own, 30-second audio, 15-second video (record or upload)",
  "Gemini transcription you can correct, wording help (keep / clearer / shorter), one-question clarification",
  "Exact approval bound to text, version and audience; idempotent sending",
  "Recipient-only “Make clearer” reading aid, device text-to-speech with speed control",
  "Phrasebook with explicit “Save this meaning”, block, report and an owner review queue",
  "Deletion of drafts, recordings and account; 24-hour retention job; content-free diagnostics",
  "Voice and video calls (1-to-1 and group) with live captions, a private AI interpreter, “say it for me” read aloud, and one-tap signals; nothing from a call is recorded",
];

const DEFERRED = [
  "P1: visual object context from video frames, activity invitations and RSVP, more languages, MCP adapter",
  "P2: live streaming capture, public communities, remote A2A agents, WhatsApp, personalised acoustic training, verified switch access",
];

const LIMITS = [
  "InTune is communication support. It does not diagnose, monitor mood, assess capacity or provide therapy.",
  "English is the only language the prompts target. Other languages get original-text and manual editing.",
  "Messages update by polling every few seconds rather than a push connection.",
  "Live captions use the browser’s own speech recognition (Chrome, Edge or Safari; Chrome sends audio to Google’s speech service). The interpreter works on captions, so it needs the speaker to share captions.",
  "Video is sent to Gemini as-is for speech only; InTune deletes it after processing rather than stripping metadata locally.",
  "Duration checks on the server are best-effort for some recorder formats; size limits are always enforced.",
  "Circle owners review reports for their own circles; there is no separate moderator role yet.",
  "Evaluation uses InTune’s own scripted fixtures. Human review of meaning preservation is still pending; no clinical or population-level claim is made.",
  "Gemini eligibility for the HackGT Meta challenge has not been confirmed.",
];

function List({ items }: { items: string[] }) {
  return <ul className="mt-3 list-disc space-y-2 pl-5 text-lg">{items.map((i) => <li key={i}>{i}</li>)}</ul>;
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageTitle eyebrow="Honest scope" title="What InTune does, and doesn’t">
        Built as the HackGT 13 P0 baseline from the InTune requirements. All numeric thresholds are engineering targets, not claims.
      </PageTitle>
      <section className="mb-10"><h2 className="font-display text-2xl font-semibold">Built</h2><List items={BUILT} /></section>
      <section className="mb-10"><h2 className="font-display text-2xl font-semibold">Deferred</h2><List items={DEFERRED} /></section>
      <section><h2 className="font-display text-2xl font-semibold">Known limits</h2><List items={LIMITS} /></section>
    </div>
  );
}
