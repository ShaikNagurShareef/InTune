import type { Word } from "./tts";
import type { Overlay } from "./timeline";

export interface Cue {
  start: number;
  end: number;
  lines: string[];
}

const MAX_LINE = 42;
const MAX_LINES = 2;
const MIN_CUE = 1.0;
const MAX_CUE = 6.0;
const GAP = 0.08;

/** Splits one sentence's timed words into readable cues: ≤2 lines of ≤42 characters, breaking at punctuation when possible. */
export function cuesFor(words: Word[], offset: number): Cue[] {
  const cues: Cue[] = [];
  let lines: string[] = [""];
  let first: Word | null = null;
  let last: Word | null = null;
  const flush = () => {
    if (!first || !last || !lines[0]) return;
    cues.push({ start: offset + first.start, end: offset + last.end, lines: lines.filter(Boolean) });
    lines = [""];
    first = null;
  };
  for (const w of words) {
    const line = lines[lines.length - 1];
    const candidate = line ? `${line} ${w.text}` : w.text;
    const tooLong = candidate.length > MAX_LINE;
    const tooSlow = first && offset + w.end - (offset + (first as Word).start) > MAX_CUE;
    if (tooSlow || (tooLong && lines.length >= MAX_LINES)) {
      flush();
      lines = [w.text];
    } else if (tooLong) {
      lines.push(w.text);
    } else {
      lines[lines.length - 1] = candidate;
    }
    first ??= w;
    last = w;
    // Prefer to end a cue on a sentence break when the cue already has some text.
    if (/[.?!]["”’)]?$/.test(w.text) && lines.join(" ").length > 24) flush();
  }
  flush();
  return cues;
}

/** Enforces minimum length and gaps so cues never overlap. */
export function tidy(cues: Cue[]): Cue[] {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  return sorted.map((c, i) => {
    const next = sorted[i + 1];
    const end = Math.max(c.end + 0.15, c.start + MIN_CUE);
    return { ...c, end: next ? Math.min(end, next.start - GAP) : end };
  });
}

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");
const srtTime = (s: number) => `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)},${pad((s % 1) * 1000, 3)}`;
const vttTime = (s: number) => srtTime(s).replace(",", ".");
const assTime = (s: number) => `${Math.floor(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}.${pad((s % 1) * 100)}`;

export const toSrt = (cues: Cue[]) =>
  cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.lines.join("\n")}\n`).join("\n");

export const toVtt = (cues: Cue[]) => `WEBVTT\n\n${cues.map((c) => `${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.lines.join("\n")}\n`).join("\n")}`;

const assText = (s: string) => s.replace(/\\/g, "\\\\").replace(/{/g, "(").replace(/}/g, ")");

/** Captions sit in the dark band under the app; notes and "sped up" labels sit top-right over it. */
export function toAss(cues: Cue[], overlays: Overlay[], labels: Overlay[] = []): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Helvetica Neue,44,&H00EFF4F6,&H00EFF4F6,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,120,120,34,1
Style: Note,Helvetica Neue,30,&H00FFFFFF,&H00FFFFFF,&H209E5B63,&H33000000,1,0,0,0,100,100,0,0,3,14,0,9,48,48,40,1
Style: Label,Helvetica Neue,28,&H00EFF4F6,&H00EFF4F6,&H40271E1E,&H33000000,1,0,0,0,100,100,0,0,3,12,0,7,40,40,36,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const captionEvents = cues.map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Caption,,0,0,0,,${c.lines.map(assText).join("\\N")}`);
  const noteEvents = overlays.map((o) => `Dialogue: 1,${assTime(o.start)},${assTime(o.end)},Note,,0,0,0,,${assText(o.text)}`);
  const labelEvents = labels.map((o) => `Dialogue: 1,${assTime(o.start)},${assTime(o.end)},Label,,0,0,0,,${assText(o.text)}`);
  return header + [...captionEvents, ...noteEvents, ...labelEvents].join("\n") + "\n";
}
