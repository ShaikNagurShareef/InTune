import type { Take } from "./capture";
import { AI_KEEP_END, AI_KEEP_START } from "./actions";

export interface ConcatEntry {
  file: string;
  duration: number;
}

export interface Overlay {
  start: number;
  end: number;
  text: string;
}

export interface BeatPlacement {
  /** Output time (seconds, from the start of this scene) where the beat starts. */
  start: number;
  duration: number;
}

export interface SceneEdit {
  entries: ConcatEntry[];
  beats: BeatPlacement[];
  overlays: Overlay[];
  duration: number;
}

type Range = [number, number];

interface Kept {
  range: Range;
  /** True for AI waits; false for ordinary waits (labels starting with "wait-", e.g. someone joining). */
  ai: boolean;
}

function waitCuts(take: Take): { cuts: Range[]; kept: Kept[] } {
  const cuts: Range[] = [];
  const kept: Kept[] = [];
  let open: { t: number; ai: boolean } | null = null;
  for (const m of take.marks) {
    if (m.name.startsWith("ai:start:")) {
      open = { t: m.t, ai: !m.name.startsWith("ai:start:wait-") };
    } else if (open && m.name.startsWith("ai:cut:")) {
      cuts.push([open.t, m.t]);
      open = null;
    } else if (open && m.name.startsWith("ai:end:")) {
      const from = open.t + AI_KEEP_START;
      const to = m.t - AI_KEEP_END;
      if (to > from) {
        cuts.push([from, to]);
        kept.push({ range: [open.t, from], ai: open.ai }, { range: [to, m.t], ai: open.ai });
      }
      open = null;
    }
  }
  return { cuts, kept };
}

/** [a, b) minus the cut ranges, in order. */
function subtract([a, b]: Range, cuts: Range[]): Range[] {
  let pieces: Range[] = [[a, b]];
  for (const [ca, cb] of cuts) {
    pieces = pieces.flatMap(([pa, pb]): Range[] => {
      if (cb <= pa || ca >= pb) return [[pa, pb]];
      return [
        ...(ca > pa ? ([[pa, ca]] as Range[]) : []),
        ...(cb < pb ? ([[cb, pb]] as Range[]) : []),
      ];
    });
  }
  return pieces.filter(([pa, pb]) => pb - pa > 0.001);
}

/** Frames covering [a, b): each frame is shown from its timestamp until the next frame. */
function framesFor(take: Take, [a, b]: Range): ConcatEntry[] {
  const { frames } = take;
  if (!frames.length) throw new Error(`Scene ${take.scene} captured no frames.`);
  let k = frames.findLastIndex((f) => f.t <= a);
  if (k < 0) k = 0;
  const out: ConcatEntry[] = [];
  for (; k < frames.length; k++) {
    const from = Math.max(frames[k].t, a);
    const to = Math.min(frames[k + 1]?.t ?? take.stoppedAt, b);
    if (from >= b) break;
    if (to > from) out.push({ file: frames[k].file, duration: to - from });
  }
  return out;
}

const beatRange = (take: Take, i: number): Range => {
  const start = take.marks.find((m) => m.name === `beat:${i}:start`)?.t;
  const end = take.marks.find((m) => m.name === `beat:${i}:end`)?.t;
  if (start === undefined || end === undefined) throw new Error(`Scene ${take.scene} is missing marks for beat ${i}.`);
  return [start, end];
};

/**
 * Builds the scene's edit: each beat's footage (with AI waits shortened) placed back to back, and each
 * beat lasting at least as long as its narration (holding the last frame if needed).
 */
export function editScene(take: Take, narration: number[], notes: (string | undefined)[]): SceneEdit {
  const { cuts, kept } = waitCuts(take);
  const entries: ConcatEntry[] = [];
  const beats: BeatPlacement[] = [];
  const overlays: Overlay[] = [];
  let t = 0;
  narration.forEach((spoken, i) => {
    const range = beatRange(take, i);
    const pieces = subtract(range, cuts);
    const start = t;
    for (const piece of pieces) {
      // "Sped up" label over the kept ends of any shortened AI wait inside this piece.
      for (const k of kept) {
        const a = Math.max(k.range[0], piece[0]);
        const b = Math.min(k.range[1], piece[1]);
        if (b > a) overlays.push({ start: t + (a - piece[0]), end: t + (b - piece[0]), text: k.ai ? "AI working · sped up" : "Sped up" });
      }
      const got = framesFor(take, piece);
      entries.push(...got);
      t += got.reduce((n, e) => n + e.duration, 0);
    }
    const shortBy = spoken - (t - start);
    if (shortBy > 0 && entries.length) {
      entries.push({ file: entries[entries.length - 1].file, duration: shortBy });
      t += shortBy;
    }
    beats.push({ start, duration: t - start });
    if (notes[i]) overlays.push({ start, end: t, text: notes[i] as string });
  });
  return { entries: merge(entries), beats, overlays: mergeOverlays(overlays), duration: t };
}

function merge(entries: ConcatEntry[]): ConcatEntry[] {
  const out: ConcatEntry[] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && last.file === e.file) last.duration += e.duration;
    else out.push({ ...e });
  }
  return out;
}

function mergeOverlays(overlays: Overlay[]): Overlay[] {
  const out: Overlay[] = [];
  for (const o of [...overlays].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && last.text === o.text && o.start - last.end < 0.3) last.end = Math.max(last.end, o.end);
    else out.push({ ...o });
  }
  return out;
}
