import { z } from "zod";
import { Coffee, Hand, RotateCcw, ThumbsDown, ThumbsUp, Turtle, type LucideIcon } from "lucide-react";

/** Everything sent between call participants over LiveKit's data channel (topic "intune"). Never stored. */
export const DATA_TOPIC = "intune";

export type CallData =
  | { t: "caption"; id: string; text: string; final: boolean }
  | { t: "say"; id: string; text: string }
  | { t: "signal"; id: string; kind: SignalKind };

/** Non-verbal signals: a calm way to steer the conversation without interrupting. */
export const SIGNALS = [
  { id: "hand", label: "I want to speak", icon: Hand },
  { id: "slow", label: "Please slow down", icon: Turtle },
  { id: "repeat", label: "Please say that again", icon: RotateCcw },
  { id: "break", label: "I need a short break", icon: Coffee },
  { id: "yes", label: "Yes", icon: ThumbsUp },
  { id: "no", label: "No", icon: ThumbsDown },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];
export type SignalKind = (typeof SIGNALS)[number]["id"];
export const signalInfo = (id: string) => SIGNALS.find((s) => s.id === id);

export const MAX_TEXT = 600;
const MAX_PAYLOAD_BYTES = 4096;
const SIGNAL_IDS = SIGNALS.map((s) => s.id) as [SignalKind, ...SignalKind[]];

/** Messages come from other people's browsers, so each one is checked strictly before use. */
const callData = z.discriminatedUnion("t", [
  z.object({ t: z.literal("caption"), id: z.string().max(64), text: z.string().trim().min(1).max(MAX_TEXT), final: z.boolean() }),
  z.object({ t: z.literal("say"), id: z.string().max(64), text: z.string().trim().min(1).max(MAX_TEXT) }),
  z.object({ t: z.literal("signal"), id: z.string().max(64), kind: z.enum(SIGNAL_IDS) }),
]);

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const encode = (d: CallData): Uint8Array => encoder.encode(JSON.stringify(d));

export function decode(payload: Uint8Array): CallData | null {
  if (payload.byteLength > MAX_PAYLOAD_BYTES) return null;
  try {
    const parsed = callData.safeParse(JSON.parse(decoder.decode(payload)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // Not JSON: ignore.
  }
}

export interface Interpretation {
  plain: string;
  asking: string;
  replyExpected: "yes" | "no" | "unclear";
  unclear: string;
  warnings: string[];
}

export interface TranscriptEntry {
  id: string;
  from: { identity: string; name: string };
  mine: boolean;
  kind: "caption" | "say" | "signal";
  text: string;
  at: number;
  interp?: Interpretation | "loading" | "error";
}
