"use client";

import { useRef, useState } from "react";
import { CalendarClock, CircleHelp, Gift, HeartHandshake, Lightbulb, Loader2, MapPin, Sparkles, Users } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useAiAvailable } from "@/components/ai-provider";
import { Modal } from "@/components/modal";
import { Button, Notice } from "@/components/ui";
import { ReviewPanel } from "./composer/review-panel";
import { approveAndPublish, newSendCache } from "./composer/send";
import type { Draft } from "./composer/types";
import type { CircleInfo, Me } from "./types";

export interface GroupPlan {
  title: string;
  when: string;
  where: string;
  what: string;
  bring: { who: string; item: string }[];
  comfort: { who: string; need: string; how: string }[];
  openQuestions: { question: string; ask: string }[];
  suggestions: string[];
  basedOn: number;
}

interface Props {
  circle: CircleInfo;
  me: Me;
  onClose: () => void;
  onPosted: () => void;
}

type Step = { name: "ask" } | { name: "plan"; plan: GroupPlan; draft: Draft } | { name: "review"; plan: GroupPlan; draft: Draft };

/**
 * "Plan it together": AI reads the recent conversation and what each member shared about how they
 * communicate, and drafts one plan that works for everyone. Only the organiser sees it until they
 * approve the exact text, which is then posted like any AI-assisted message.
 */
export function PlanSheet({ circle, me, onClose, onPosted }: Props) {
  const aiAvailable = useAiAvailable();
  const [step, setStep] = useState<Step>({ name: "ask" });
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(newSendCache());
  const memberNames = circle.members.map((m) => (m.id === me.id ? "you" : m.displayName));

  async function draftPlan() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ plan: GroupPlan; draft: Draft }>(`/api/v1/circles/${circle.id}/plan`, { body: { goal }, gemini: true });
      setStep({ name: "plan", ...result });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn’t draft a plan. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function post(draft: Draft, acknowledged: boolean) {
    setBusy(true);
    setError(null);
    try {
      await approveAndPublish(circle.id, draft, acknowledged, cache.current);
      onPosted();
      onClose();
    } catch (err) {
      setError(`Not posted. ${err instanceof ApiError ? err.message : "Please try again."}`);
      if (err instanceof ApiError && err.code === "stale_version" && step.name === "review") {
        const fresh = await api<Draft>(`/api/v1/drafts/${draft.id}`).catch(() => draft);
        setStep({ ...step, draft: fresh });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Plan it together" onClose={onClose}>
      <div className="space-y-4 p-4">
        {step.name === "ask" && (
          <AskStep goal={goal} onGoal={setGoal} aiAvailable={aiAvailable} busy={busy} onDraft={() => void draftPlan()} />
        )}
        {step.name === "plan" && (
          <PlanStep plan={step.plan} onRedo={() => setStep({ name: "ask" })} onReview={() => setStep({ ...step, name: "review" })} />
        )}
        {step.name === "review" && (
          <ReviewPanel
            variant="plan"
            draft={step.draft}
            circleName={circle.name}
            memberNames={memberNames}
            replyLabel={null}
            isSending={busy}
            sendError={error}
            onDraftChange={(draft) => setStep({ ...step, draft })}
            onApproveAndSend={(draft, ack) => void post(draft, ack)}
            onBack={() => setStep({ ...step, name: "plan" })}
          />
        )}
        {error && step.name !== "review" && <Notice tone="warn">{error}</Notice>}
      </div>
    </Modal>
  );
}

interface AskProps {
  goal: string;
  onGoal: (goal: string) => void;
  aiAvailable: boolean;
  busy: boolean;
  onDraft: () => void;
}

function AskStep({ goal, onGoal, aiAvailable, busy, onDraft }: AskProps) {
  return (
    <>
      <p className="text-sm text-ink-2">
        InTune reads the recent messages and what each person shared in <em>How to talk with me</em>, then drafts one plan that works for everyone.
        Only you see it until you approve it.
      </p>
      <label className="block">
        <span className="mb-1 block text-sm font-bold">What are we planning? (optional)</span>
        <input
          value={goal}
          onChange={(e) => onGoal(e.target.value)}
          maxLength={300}
          placeholder="For example: a meetup this weekend"
          className="min-h-11 w-full rounded-xl border border-line bg-card px-3"
        />
      </label>
      {aiAvailable ? (
        <Button tone="primary" className="w-full" disabled={busy} onClick={onDraft}>
          {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Sparkles aria-hidden="true" className="h-4 w-4" />}
          {busy ? "Reading the conversation…" : "Draft a plan"}
        </Button>
      ) : (
        <Notice>Add an AI key in Settings to draft plans.</Notice>
      )}
    </>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span aria-hidden="true" className="mt-0.5 text-teal">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-2">{label}</p>
        <div className="text-[15px]">{children}</div>
      </div>
    </div>
  );
}

function PlanStep({ plan, onRedo, onReview }: { plan: GroupPlan; onRedo: () => void; onReview: () => void }) {
  const notAgreed = <span className="text-amber-ink">Not agreed yet</span>;
  return (
    <>
      <div className="space-y-3 rounded-3xl bg-paper-2 p-4" data-testid="plan-card">
        <p className="flex items-center gap-1.5 text-xs font-bold text-ai">
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" /> Drafted from {plan.basedOn} messages · only you see this
        </p>
        <h3 className="text-lg font-extrabold">{plan.title}</h3>
        <Row icon={<CalendarClock className="h-5 w-5" />} label="When">{plan.when || notAgreed}</Row>
        <Row icon={<MapPin className="h-5 w-5" />} label="Where">{plan.where || notAgreed}</Row>
        {plan.what && <Row icon={<Users className="h-5 w-5" />} label="What">{plan.what}</Row>}
        {plan.bring.length > 0 && (
          <Row icon={<Gift className="h-5 w-5" />} label="Bringing">
            {plan.bring.map((b) => `${b.who} – ${b.item}`).join("; ")}
          </Row>
        )}
        {plan.comfort.length > 0 && (
          <Row icon={<HeartHandshake className="h-5 w-5" />} label="So it works for everyone">
            <ul className="space-y-1">
              {plan.comfort.map((c) => (
                <li key={`${c.who}:${c.need}`}>
                  {c.how} <span className="text-ink-2">({c.who}: {c.need})</span>
                </li>
              ))}
            </ul>
          </Row>
        )}
        {plan.openQuestions.length > 0 && (
          <Row icon={<CircleHelp className="h-5 w-5" />} label="Still to decide">
            <ul className="space-y-1">
              {plan.openQuestions.map((q) => (
                <li key={q.question}>
                  {q.ask !== "everyone" && <strong>{q.ask}: </strong>}
                  {q.question}
                </li>
              ))}
            </ul>
          </Row>
        )}
      </div>
      {plan.suggestions.length > 0 && (
        <div className="rounded-2xl border border-line p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-bold">
            <Lightbulb aria-hidden="true" className="h-4 w-4 text-amber-ink" /> Ideas that fit everyone (not in the post)
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {plan.suggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        <Button tone="quiet" className="flex-1" onClick={onRedo}>
          Start over
        </Button>
        <Button tone="primary" className="flex-1" onClick={onReview}>
          Review and post
        </Button>
      </div>
    </>
  );
}
