import { Command } from "@langchain/langgraph";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { drafts, jobs } from "@/lib/db/schema";
import { AppError, notFound } from "@/lib/errors";
import type { GeminiCredentials } from "@/lib/gemini/client";
import { JOB_DEADLINE_MS, PROMPT_VERSION } from "@/lib/gemini/config";
import {
  buildAssistGraph,
  type AssistDeps,
  type AssistInput,
  type AssistInterrupt,
  type AssistStateType,
} from "@/lib/graph/assist-graph";
import { deleteCheckpoints, getCheckpointer } from "@/lib/graph/checkpointer";
import { geminiMediaPart } from "@/lib/media/gemini-part";
import { readObject } from "@/lib/media/storage";
import { openAiTranscribe } from "@/lib/gemini/openai";
import { recordEvent } from "@/lib/metrics";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_MESSAGE_CHARS, type WordingMode } from "@/lib/validation";
import { getPreferences } from "./accounts";
import { getOwnedDraft, type Draft } from "./drafts";
import { eraseMedia, getOwnedMedia } from "./media";
import { findRelevantPhrases } from "./phrasebook";

const ASSIST_LIMIT_PER_HOUR = 60;
const MAX_ANSWER_CHARS = 300;
const ACTIVE = ["RUNNING", "NEEDS_CLARIFICATION"];

type Job = typeof jobs.$inferSelect;

export interface AssistResult {
  draft_text: string;
  evidence_ids: string[];
  uncertain_spans: { text: string; reason: string }[];
  unresolved_fields: { field: string; reason: string }[];
  clarification_question: string;
  choices: string[];
  unsupported_additions: string[];
  lost_meaning: string[];
  used_phrases: { id: string; revision: number; phrase: string; meaning: string }[];
  answers: { question: string; answer: string }[];
  input_version: number;
  model_version: string;
  prompt_version: string;
}

export interface JobView {
  id: string;
  status: string;
  stage: string;
  draftVersion: number;
  pending: AssistInterrupt | null;
  errorCode: string | null;
}

const toView = (job: Job): JobView => ({
  id: job.id,
  status: job.status,
  stage: job.stage,
  draftVersion: job.inputVersion,
  pending: job.status === "NEEDS_CLARIFICATION" ? (job.result as AssistInterrupt) : null,
  errorCode: job.errorCode,
});

function makeDeps(job: Job, creds: GeminiCredentials, signal: AbortSignal, used: { model: string }): AssistDeps {
  return {
    creds,
    signal,
    async mediaPart(mediaId) {
      const row = await getOwnedMedia(job.ownerId, mediaId);
      return geminiMediaPart(creds, row);
    },
    ...(creds.provider === "openai" && {
      async transcribe(mediaId: string) {
        const row = await getOwnedMedia(job.ownerId, mediaId);
        const bytes = await readObject(row.storageKey);
        if (!bytes) throw new AppError("not_found", "The recording is no longer available. Please record again.");
        return openAiTranscribe(creds.apiKey, bytes, row.mime, row.kind).catch((err: unknown) => {
          if (err instanceof AppError) throw err;
          throw new AppError("ai_unavailable", "Couldn't turn the recording into words. Try again, or type instead.");
        });
      },
    }),
    findPhrases: findRelevantPhrases,
    async onStage(stage) {
      await db().update(jobs).set({ stage, updatedAt: new Date() }).where(eq(jobs.id, job.id));
    },
    onModelCall(node, ms, repaired, model) {
      used.model = model;
      void recordEvent("model_call", { node, ms, repaired, model, prompt: PROMPT_VERSION });
      // Record the model that actually answered (it may be a fallback), for honest assist results.
      void db().update(jobs).set({ modelId: model }).where(eq(jobs.id, job.id)).catch(() => undefined);
    },
  };
}

async function failJob(job: Job, errorCode: string, draftStatus = "DRAFT"): Promise<Job | undefined> {
  // A cancelled job stays CANCELLED; only live jobs are marked FAILED.
  const [row] = await db()
    .update(jobs)
    .set({ status: "FAILED", errorCode, updatedAt: new Date() })
    .where(and(eq(jobs.id, job.id), eq(jobs.cancelled, false)))
    .returning();
  await db()
    .update(drafts)
    .set({ status: draftStatus })
    .where(and(eq(drafts.id, job.draftId), eq(drafts.version, job.inputVersion)));
  return row;
}

function buildResult(state: AssistStateType, inputVersion: number, model: string): AssistResult {
  const c = state.composed;
  const used = new Set(c?.used_phrase_ids ?? []);
  return {
    draft_text: c?.draft_text ?? "",
    evidence_ids: c?.evidence_ids ?? [],
    uncertain_spans: c?.uncertain_spans ?? [],
    unresolved_fields: c?.unresolved_fields ?? [],
    clarification_question: "",
    choices: [],
    unsupported_additions: state.flags?.unsupportedAdditions ?? [],
    lost_meaning: state.flags?.lostMeaning ?? [],
    used_phrases: state.phrases.filter((p) => used.has(p.id)),
    answers: state.answers,
    input_version: inputVersion,
    model_version: model,
    prompt_version: PROMPT_VERSION,
  };
}

/**
 * Applies a graph outcome only if the draft is still at the version the job started from and the job
 * was not cancelled. Late or superseded output is discarded (FR27).
 */
async function applyOutcome(job: Job, state: AssistStateType, pending: AssistInterrupt | null, modelUsed: string): Promise<Job> {
  return db().transaction(async (tx) => {
    const [fresh] = await tx.select().from(jobs).where(eq(jobs.id, job.id)).for("update");
    const [draft] = await tx.select().from(drafts).where(eq(drafts.id, job.draftId)).for("update");
    if (!fresh || fresh.cancelled) return fresh ?? job;
    if (!draft || draft.version !== fresh.inputVersion || draft.deletedAt) {
      const [obsolete] = await tx
        .update(jobs)
        .set({ status: "CANCELLED", errorCode: "superseded", updatedAt: new Date() })
        .where(eq(jobs.id, job.id))
        .returning();
      return obsolete;
    }
    if (state.manualReason) {
      await tx.update(drafts).set({ status: "DRAFT" }).where(eq(drafts.id, draft.id));
      const [failed] = await tx
        .update(jobs)
        .set({ status: "FAILED", errorCode: state.manualReason, updatedAt: new Date() })
        .where(eq(jobs.id, job.id))
        .returning();
      return failed;
    }
    if (pending && pending.kind !== "review") {
      const isMediaDraft = draft.sourceMode === "speak" || draft.sourceMode === "video";
      const transcript = isMediaDraft ? state.transcript : draft.transcript;
      // For media drafts the (possibly corrected) transcript is the person's current words.
      const fromTranscript = isMediaDraft && transcript ? { text: transcript, aiAssisted: true } : {};
      await tx
        .update(drafts)
        .set({ status: "NEEDS_CLARIFICATION", transcript, ...fromTranscript })
        .where(eq(drafts.id, draft.id));
      const [waiting] = await tx
        .update(jobs)
        .set({
          status: "NEEDS_CLARIFICATION",
          stage: pending.kind === "transcript" ? "Check the words" : "One question",
          result: pending,
          clarificationRounds: state.rounds,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id))
        .returning();
      return waiting;
    }
    const nextVersion = draft.version + 1;
    const result = buildResult(state, nextVersion, modelUsed || fresh.modelId || "");
    await tx
      .update(drafts)
      .set({
        text: result.draft_text,
        transcript: state.transcript,
        aiAssisted: true,
        assist: result,
        status: "REVIEW_READY",
        version: nextVersion,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, draft.id));
    const [ready] = await tx
      .update(jobs)
      .set({ status: "REVIEW_READY", stage: "Ready to review", inputVersion: nextVersion, result, updatedAt: new Date() })
      .where(eq(jobs.id, job.id))
      .returning();
    return ready;
  });
}

async function runSegment(
  job: Job,
  creds: GeminiCredentials,
  payload: AssistInput | Command<unknown, Partial<AssistStateType>, never>,
  clientSignal?: AbortSignal,
): Promise<JobView> {
  const deadline = AbortSignal.timeout(JOB_DEADLINE_MS);
  const signal = clientSignal ? AbortSignal.any([clientSignal, deadline]) : deadline;
  const used = { model: "" };
  const graph = buildAssistGraph(makeDeps(job, creds, signal, used), await getCheckpointer());
  const config = { configurable: { thread_id: job.id }, signal };
  const started = Date.now();
  try {
    await graph.invoke(payload, config);
  } catch (err) {
    if (!(err instanceof AppError)) {
      console.error(`[assist] unexpected ${err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : "error"}`);
    }
    const appErr =
      err instanceof AppError
        ? err
        : new AppError("ai_unavailable", "AI translation is busy right now (all models are at capacity). Try again in a minute, or send your own words.");
    await failJob(job, appErr.code);
    const draft = await getOwnedDraft(job.ownerId, job.draftId).catch(() => null);
    if (draft?.mediaId && !draft.transcript) await eraseMedia(draft.mediaId);
    void recordEvent("assist_outcome", { outcome: "error", code: appErr.code, ms: Date.now() - started });
    throw appErr;
  }
  const snapshot = await graph.getState(config);
  const pending = (snapshot.tasks.flatMap((t) => t.interrupts ?? [])[0]?.value ?? null) as AssistInterrupt | null;
  const state = snapshot.values as AssistStateType;
  const applied = await applyOutcome(job, state, pending, used.model);
  if (state.mediaId && (state.transcript || state.manualReason)) await eraseMedia(state.mediaId);
  void recordEvent("assist_outcome", {
    outcome: applied.status,
    ms: Date.now() - started,
    rounds: state.rounds ?? 0,
    model: creds.model,
  });
  return toView(applied);
}

function sourceFor(draft: Draft): Pick<AssistInput, "sourceMode" | "sourceText" | "mediaId"> {
  const media = draft.sourceMode === "speak" || draft.sourceMode === "video";
  if (media && !draft.transcript) {
    return { sourceMode: draft.sourceMode as AssistInput["sourceMode"], sourceText: "", mediaId: draft.mediaId };
  }
  const text = media ? (draft.transcript ?? "") : draft.sourceText;
  return { sourceMode: "type", sourceText: text, mediaId: null };
}

export async function startAssist(
  userId: string,
  draftId: string,
  opts: { expectedVersion: number; wordingMode: WordingMode },
  creds: GeminiCredentials,
  signal?: AbortSignal,
): Promise<JobView> {
  const draft = await getOwnedDraft(userId, draftId);
  if (draft.version !== opts.expectedVersion) throw new AppError("stale_version", "This draft changed. Showing the latest version.");
  if (draft.status === "SENT") throw new AppError("conflict", "This draft was already sent.");
  await rateLimit(`assist:${userId}`, ASSIST_LIMIT_PER_HOUR, 3600);
  const prefs = await getPreferences(userId);

  await db()
    .update(jobs)
    .set({ cancelled: true, status: "CANCELLED", errorCode: "superseded" })
    .where(and(eq(jobs.draftId, draftId), inArray(jobs.status, ACTIVE)));
  const [job] = await db()
    .insert(jobs)
    .values({
      draftId,
      ownerId: userId,
      inputVersion: draft.version,
      wordingMode: opts.wordingMode,
      modelId: creds.model,
      promptVersion: PROMPT_VERSION,
      stage: "Starting",
    })
    .returning();
  await db().update(drafts).set({ status: "PROCESSING" }).where(eq(drafts.id, draftId));

  const input: AssistInput = {
    ownerId: userId,
    draftId,
    wordingMode: opts.wordingMode,
    sentenceLength: prefs.sentenceLength,
    ...sourceFor(draft),
  };
  return runSegment(job, creds, input, signal);
}

async function getOwnedJob(userId: string, jobId: string): Promise<Job> {
  const [job] = await db().select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.ownerId, userId)));
  if (!job) throw notFound();
  return job;
}

export async function latestJobForDraft(userId: string, draftId: string): Promise<JobView | null> {
  await getOwnedDraft(userId, draftId);
  const [job] = await db()
    .select()
    .from(jobs)
    .where(and(eq(jobs.draftId, draftId), eq(jobs.ownerId, userId)))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  return job ? toView(job) : null;
}

export async function getJob(userId: string, jobId: string): Promise<JobView> {
  return toView(await getOwnedJob(userId, jobId));
}

export interface ResumeInput {
  answer?: string;
  transcript?: string;
  wordingMode?: WordingMode;
}

/** Resumes are authenticated against the owner and the expected draft version (spec §7 "Resume and replay"). */
export async function resumeAssist(
  userId: string,
  jobId: string,
  body: ResumeInput,
  creds: GeminiCredentials,
  signal?: AbortSignal,
): Promise<JobView> {
  const job = await getOwnedJob(userId, jobId);
  if (job.cancelled || job.status !== "NEEDS_CLARIFICATION") {
    throw new AppError("conflict", "This question is no longer open.");
  }
  const draft = await getOwnedDraft(userId, job.draftId);
  if (draft.version !== job.inputVersion) {
    await db().update(jobs).set({ status: "CANCELLED", errorCode: "superseded" }).where(eq(jobs.id, job.id));
    throw new AppError("stale_version", "Your draft changed, so this question was closed.");
  }
  const pending = job.result as AssistInterrupt;
  let resume: { answer: string } | { transcript: string };
  if (pending.kind === "transcript") {
    const transcript = body.transcript?.trim() ?? "";
    if (!transcript || transcript.length > MAX_MESSAGE_CHARS) {
      throw new AppError("invalid_input", "Please check the words before continuing.");
    }
    resume = { transcript };
  } else {
    const answer = body.answer?.trim() ?? "";
    if (!answer || answer.length > MAX_ANSWER_CHARS) throw new AppError("invalid_input", "Choose an answer or type one.");
    resume = { answer };
  }
  await db().update(jobs).set({ status: "RUNNING" }).where(eq(jobs.id, job.id));
  await db().update(drafts).set({ status: "PROCESSING" }).where(eq(drafts.id, draft.id));
  const update = body.wordingMode ? { wordingMode: body.wordingMode } : undefined;
  return runSegment({ ...job, status: "RUNNING" }, creds, new Command<unknown, Partial<AssistStateType>, never>({ resume, update }), signal);
}

export async function cancelJob(userId: string, jobId: string): Promise<JobView> {
  const job = await getOwnedJob(userId, jobId);
  const [row] = await db()
    .update(jobs)
    .set({ cancelled: true, status: "CANCELLED", updatedAt: new Date() })
    .where(eq(jobs.id, job.id))
    .returning();
  await db()
    .update(drafts)
    .set({ status: "DRAFT" })
    .where(and(eq(drafts.id, job.draftId), inArray(drafts.status, ["PROCESSING", "NEEDS_CLARIFICATION"])));
  await deleteCheckpoints(job.id);
  const draft = await getOwnedDraft(userId, job.draftId).catch(() => null);
  if (draft?.mediaId) await eraseMedia(draft.mediaId);
  return toView(row);
}
