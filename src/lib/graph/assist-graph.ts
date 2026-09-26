import { Annotation, END, START, StateGraph, interrupt, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { Part } from "@google/genai";
import { AppError } from "@/lib/errors";
import { generateJson, type GeminiCredentials } from "@/lib/gemini/client";
import { MAX_AUTO_CLARIFICATION_ROUNDS, MAX_CHOICES } from "@/lib/gemini/config";
import {
  CHECK_SYSTEM,
  COMPOSE_SYSTEM,
  INTERPRET_SYSTEM,
  checkOutput,
  composeOutput,
  interpretOutput,
  type ComposeOutput,
} from "@/lib/gemini/prompts";
import { describeSlot, diffSlots } from "@/lib/meaning/critical-slots";
import type { PhraseRef } from "@/lib/services/phrasebook";
import { MAX_MESSAGE_CHARS, type SourceMode, type WordingMode } from "@/lib/validation";

export interface Span {
  text: string;
  reason: string;
}

export interface ClarificationAnswer {
  question: string;
  answer: string;
}

export interface MeaningFlags {
  unsupportedAdditions: string[];
  lostMeaning: string[];
}

export interface PendingQuestion {
  question: string;
  choices: string[];
}

export type ManualReason = "no_speech" | "multiple_speakers";

/** Side-effecting capabilities are injected by closure so credentials never enter checkpointed config or state. */
export interface AssistDeps {
  creds: GeminiCredentials;
  signal?: AbortSignal;
  mediaPart(mediaId: string): Promise<{ part: Part; cleanup(): Promise<void> }>;
  findPhrases(ownerId: string, text: string): Promise<PhraseRef[]>;
  onStage(stage: string): Promise<void>;
  onModelCall(node: string, ms: number, repaired: boolean): void;
}

export const AssistState = Annotation.Root({
  ownerId: Annotation<string>,
  draftId: Annotation<string>,
  sourceMode: Annotation<SourceMode>,
  sourceText: Annotation<string>,
  mediaId: Annotation<string | null>,
  wordingMode: Annotation<WordingMode>,
  sentenceLength: Annotation<string>,
  transcript: Annotation<string>,
  transcriptSpans: Annotation<Span[]>,
  phrases: Annotation<PhraseRef[]>,
  answers: Annotation<ClarificationAnswer[]>,
  rounds: Annotation<number>,
  composed: Annotation<ComposeOutput | null>,
  flags: Annotation<MeaningFlags | null>,
  pending: Annotation<PendingQuestion | null>,
  manualReason: Annotation<ManualReason | null>,
});

export type AssistStateType = typeof AssistState.State;
export type AssistInput = Pick<
  AssistStateType,
  "ownerId" | "draftId" | "sourceMode" | "sourceText" | "mediaId" | "wordingMode" | "sentenceLength"
>;

/** Interrupt payloads surfaced to the application. */
export type AssistInterrupt =
  | { kind: "transcript"; transcript: string; uncertainSpans: Span[] }
  | { kind: "clarify"; question: string; choices: string[]; draftPreview: string }
  | { kind: "review" };

export type TranscriptResume = { transcript: string };
export type ClarifyResume = { answer: string };

const isMedia = (mode: SourceMode) => mode === "speak" || mode === "video";

function cleanChoices(choices: string[]): string[] {
  const seen = new Set<string>();
  return choices
    .map((c) => c.trim())
    .filter((c) => c && !/^something else$/i.test(c) && !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()))
    .slice(0, MAX_CHOICES);
}

export function buildAssistGraph(deps: AssistDeps, checkpointer: BaseCheckpointSaver) {
  async function timed<T>(node: string, fn: () => Promise<{ data: T; repaired: boolean }>): Promise<T> {
    const started = Date.now();
    const { data, repaired } = await fn();
    deps.onModelCall(node, Date.now() - started, repaired);
    return data;
  }

  const validateInput = async (s: AssistStateType) => {
    if (isMedia(s.sourceMode)) {
      if (!s.mediaId) throw new AppError("invalid_input", "Record or upload something first.");
    } else if (!s.sourceText.trim() || s.sourceText.length > MAX_MESSAGE_CHARS) {
      throw new AppError("invalid_input", "Type or choose some words first.");
    }
    return { answers: [], rounds: 0, phrases: [], composed: null, flags: null, pending: null, manualReason: null };
  };

  const interpret = async (s: AssistStateType) => {
    if (!isMedia(s.sourceMode) || !s.mediaId) return { transcript: s.sourceText, transcriptSpans: [] };
    await deps.onStage("Listening to your recording");
    const { part, cleanup } = await deps.mediaPart(s.mediaId);
    try {
      const out = await timed("interpret", () =>
        generateJson(
          deps.creds,
          { system: INTERPRET_SYSTEM, parts: [part, { text: "Transcribe the main speaker." }], signal: deps.signal },
          interpretOutput,
        ),
      );
      if (out.no_speech || !out.transcript.trim()) return { manualReason: "no_speech" as const };
      if (out.multiple_speakers) return { manualReason: "multiple_speakers" as const };
      return { transcript: out.transcript.trim().slice(0, MAX_MESSAGE_CHARS), transcriptSpans: out.uncertain_spans };
    } finally {
      await cleanup();
    }
  };

  /** Lets the person correct the transcript before any rewriting (FR15). */
  const confirmTranscript = async (s: AssistStateType) => {
    const resume = interrupt<AssistInterrupt, TranscriptResume>({
      kind: "transcript",
      transcript: s.transcript,
      uncertainSpans: s.transcriptSpans,
    });
    return { transcript: resume.transcript, transcriptSpans: [] };
  };

  const retrievePhrases = async (s: AssistStateType) => {
    await deps.onStage("Understanding what you mean");
    return { phrases: await deps.findPhrases(s.ownerId, s.transcript) };
  };

  const compose = async (s: AssistStateType) => {
    await deps.onStage("Translating");
    const input = {
      mode: s.wordingMode,
      sentence_length: s.sentenceLength,
      force_draft: s.rounds >= MAX_AUTO_CLARIFICATION_ROUNDS,
      source: { id: "source", text: s.transcript, uncertain: s.transcriptSpans },
      phrases: s.phrases.map((p) => ({ id: `phrase:${p.id}`, phrase: p.phrase, meaning: p.meaning })),
      answers: s.answers.map((a, i) => ({ id: `answer:${i + 1}`, question: a.question, answer: a.answer })),
    };
    const out = await timed("compose", () =>
      generateJson(
        deps.creds,
        { system: COMPOSE_SYSTEM, parts: [{ text: JSON.stringify(input) }], signal: deps.signal },
        composeOutput,
      ),
    );
    // Only phrases actually offered to the model can be cited; anything else is dropped.
    const offered = new Set(s.phrases.map((p) => p.id));
    const usedPhraseIds = out.used_phrase_ids.map((id) => id.replace(/^phrase:/, "")).filter((id) => offered.has(id));
    return {
      composed: {
        ...out,
        draft_text: out.draft_text.trim().slice(0, MAX_MESSAGE_CHARS),
        choices: cleanChoices(out.choices),
        used_phrase_ids: usedPhraseIds,
      },
    };
  };

  const checkMeaning = async (s: AssistStateType) => {
    await deps.onStage("Checking nothing was changed or added");
    const draft = s.composed?.draft_text ?? "";
    const input = { source: s.transcript, answers: s.answers, draft };
    const out = await timed("check", () =>
      generateJson(
        deps.creds,
        { system: CHECK_SYSTEM, parts: [{ text: JSON.stringify(input) }], signal: deps.signal },
        checkOutput,
      ),
    );
    const evidence = [s.transcript, ...s.answers.map((a) => a.answer)].join("\n");
    const slots = diffSlots(evidence, draft.replace(/\[[^\]]*\?\]/g, ""));
    const unique = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
    const flags: MeaningFlags = {
      unsupportedAdditions: unique([
        ...(s.composed?.unsupported_additions ?? []),
        ...out.unsupported_additions,
        ...slots.added.filter((a) => a.kind !== "name").map((a) => `Added ${describeSlot(a)}`),
      ]),
      lostMeaning: unique([...out.lost_meaning, ...slots.lost.map((l) => `Missing ${describeSlot(l)}`)]),
    };
    const question = s.composed?.clarification_question.trim() || (out.needs_clarification ? out.question.trim() : "");
    const choices = s.composed?.clarification_question.trim() ? s.composed.choices : cleanChoices(out.choices);
    const canAsk = question.length > 0 && s.rounds < MAX_AUTO_CLARIFICATION_ROUNDS;
    return { flags, pending: canAsk ? { question, choices } : null };
  };

  /** One question at a time; no answer never becomes agreement (FR17). */
  const clarify = async (s: AssistStateType) => {
    const pending = s.pending as PendingQuestion;
    const resume = interrupt<AssistInterrupt, ClarifyResume>({
      kind: "clarify",
      question: pending.question,
      choices: pending.choices,
      draftPreview: s.composed?.draft_text ?? "",
    });
    return {
      answers: [...s.answers, { question: pending.question, answer: resume.answer }],
      rounds: s.rounds + 1,
      pending: null,
    };
  };

  /** Exact draft is handed to the person; approval happens only in authenticated app code (FR21). */
  const review = async () => {
    interrupt<AssistInterrupt, unknown>({ kind: "review" });
    return {};
  };

  return new StateGraph(AssistState)
    .addNode("validateInput", validateInput)
    .addNode("interpret", interpret)
    .addNode("confirmTranscript", confirmTranscript)
    .addNode("retrievePhrases", retrievePhrases)
    .addNode("compose", compose)
    .addNode("checkMeaning", checkMeaning)
    .addNode("clarify", clarify)
    .addNode("review", review)
    .addEdge(START, "validateInput")
    .addEdge("validateInput", "interpret")
    .addConditionalEdges("interpret", (s) => {
      if (s.manualReason) return END;
      return isMedia(s.sourceMode) ? "confirmTranscript" : "retrievePhrases";
    })
    .addEdge("confirmTranscript", "retrievePhrases")
    .addEdge("retrievePhrases", "compose")
    .addEdge("compose", "checkMeaning")
    .addConditionalEdges("checkMeaning", (s) => (s.pending ? "clarify" : "review"))
    .addEdge("clarify", "compose")
    .addEdge("review", END)
    .compile({ checkpointer });
}
