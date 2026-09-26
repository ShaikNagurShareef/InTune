export interface AssistInfo {
  draft_text: string;
  uncertain_spans: { text: string; reason: string }[];
  unresolved_fields: { field: string; reason: string }[];
  unsupported_additions: string[];
  lost_meaning: string[];
  used_phrases: { id: string; revision: number; phrase: string; meaning: string }[];
  model_version: string;
}

export interface Draft {
  id: string;
  circleId: string;
  replyToId: string | null;
  version: number;
  sourceMode: string;
  sourceText: string;
  transcript: string | null;
  text: string;
  aiAssisted: boolean;
  assist: AssistInfo | null;
  status: string;
}

export type Pending =
  | { kind: "transcript"; transcript: string; uncertainSpans: { text: string; reason: string }[] }
  | { kind: "clarify"; question: string; choices: string[]; draftPreview: string }
  | { kind: "review" };

export interface JobView {
  id: string;
  status: string;
  stage: string;
  draftVersion: number;
  pending: Pending | null;
  errorCode: string | null;
}

export type WordingMode = "keep" | "clearer" | "shorter";
export type InputMode = "type" | "symbols" | "speak" | "video";
