import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TTS_DIR, VIDEO_DIR } from "./paths";
import { ffmpeg, probeDuration, run } from "./ffmpeg";

/**
 * Narration with word timings (for exact captions), cached by content hash so re-renders never repeat work.
 *
 * Providers, best first (force one with NARRATION=elevenlabs|kokoro|mac):
 *   elevenlabs  natural cloud voices; needs ELEVENLABS_API_KEY (env or gitignored video/.env.local), never logged
 *   kokoro      open-source neural TTS (Apache-2.0) run locally from video/.venv; natural, no account
 *   mac         the built-in macOS voice; always available, but robotic
 */
export type Role = "narrator" | "creator";
export type Provider = "elevenlabs" | "kokoro" | "mac";

const ELEVEN_VOICES: Record<Role, string> = {
  narrator: process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL", // "Sarah"
  creator: process.env.ELEVENLABS_CREATOR_VOICE_ID ?? "nPczCjzI2devNBz1zQrb", // "Brian"
};
export const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";
const ELEVEN_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: 0.95 };
const ELEVEN_API = "https://api.elevenlabs.io/v1";

/** Kokoro's highest-rated American voices: a warm female narrator, and a male voice for the creator's own story. */
const KOKORO_VOICES: Record<Role, string> = {
  narrator: process.env.KOKORO_VOICE ?? "af_heart",
  creator: process.env.KOKORO_CREATOR_VOICE ?? "am_michael",
};
const KOKORO_SPEED = Number(process.env.KOKORO_SPEED ?? 1.1);
const KOKORO_PYTHON = path.join(VIDEO_DIR, ".venv", "bin", "python");
const KOKORO_SCRIPT = path.join(VIDEO_DIR, "kokoro_tts.py");

export const MAC_VOICE = process.env.MAC_VOICE ?? "Samantha";
const MAC_RATE = 172;
const SAY_TIMEOUT_MS = 30_000;

/** Rough speaking rate used for rehearsals before any audio exists. */
const CHARS_PER_SECOND = 14;
export const TAIL_SECONDS = 0.35;

export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface Spoken {
  text: string;
  file: string | null;
  /** Seconds the beat must last so the sentence finishes (audio length plus a short breath). */
  duration: number;
  words: Word[];
}

/** One sentence to speak, with its neighbours (for natural flow) and who is speaking. */
export interface Line {
  text: string;
  prev?: string;
  next?: string;
  role?: Role;
}

function apiKey(): string | null {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const local = path.join(VIDEO_DIR, ".env.local");
  if (!existsSync(local)) return null;
  const line = readFileSync(local, "utf8").split("\n").find((l) => l.startsWith("ELEVENLABS_API_KEY="));
  return line ? line.slice("ELEVENLABS_API_KEY=".length).trim().replace(/^["']|["']$/g, "") : null;
}

export const hasApiKey = (): boolean => Boolean(apiKey());
const hasKokoro = (): boolean => existsSync(KOKORO_PYTHON) && existsSync(KOKORO_SCRIPT);

export function provider(): Provider {
  const forced = process.env.NARRATION;
  if (forced === "mac" || forced === "elevenlabs" || forced === "kokoro") return forced;
  if (hasApiKey()) return "elevenlabs";
  return hasKokoro() ? "kokoro" : "mac";
}

export function providerLabel(): string {
  const p = provider();
  if (p === "elevenlabs") return `ElevenLabs (${ELEVEN_VOICES.narrator} / ${ELEVEN_VOICES.creator}, ${MODEL_ID})`;
  if (p === "kokoro") return `Kokoro neural TTS (${KOKORO_VOICES.narrator} / ${KOKORO_VOICES.creator}), local`;
  return `macOS voice "${MAC_VOICE}"`;
}

/** Credit line for the outro. */
export function voiceCredit(): string {
  const p = provider();
  return p === "elevenlabs" ? "ElevenLabs" : p === "kokoro" ? "Kokoro (open-source neural TTS)" : "macOS text-to-speech";
}

function cacheKey(line: Line): string {
  const role = line.role ?? "narrator";
  const p = provider();
  const identity =
    p === "elevenlabs"
      ? { p, text: line.text, prev: line.prev ?? "", next: line.next ?? "", voice: ELEVEN_VOICES[role], MODEL_ID, ELEVEN_SETTINGS }
      : p === "kokoro"
        ? { p, text: line.text, voice: KOKORO_VOICES[role], speed: KOKORO_SPEED }
        : { text: line.text, MAC_VOICE, MAC_RATE };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 24);
}

const basePath = (line: Line) => path.join(TTS_DIR, cacheKey(line));

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

function toWords(a: Alignment): Word[] {
  const words: Word[] = [];
  let current: Word | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (current) words.push(current);
      current = null;
      return;
    }
    if (!current) current = { text: "", start: a.character_start_times_seconds[i], end: 0 };
    current.text += ch;
    current.end = a.character_end_times_seconds[i];
  });
  if (current) words.push(current);
  return words;
}

/** Punctuation tokens join their neighbours ("sister" + ":" → "sister:", "“" + "It’d" → "“It’d"). */
function mergePunctuation(tokens: Word[]): Word[] {
  const out: Word[] = [];
  let opener = "";
  for (const t of tokens) {
    if (/^[“"‘(\[]+$/.test(t.text)) {
      opener += t.text;
      continue;
    }
    if (/^[^\p{L}\p{N}]+$/u.test(t.text) && out.length) {
      out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text + t.text, end: Math.max(out[out.length - 1].end, t.end) };
      continue;
    }
    out.push({ ...t, text: opener + t.text });
    opener = "";
  }
  return out;
}

/** Words spread across a known (or estimated) duration, in proportion to their length. */
function spreadWords(text: string, duration: number): Word[] {
  const parts = text.split(/\s+/).filter(Boolean);
  const total = parts.reduce((n, w) => n + w.length + 1, 0);
  let t = 0;
  return parts.map((w) => {
    const d = ((w.length + 1) / total) * duration;
    const word = { text: w, start: t, end: t + d };
    t += d;
    return word;
  });
}

/** For rehearsals, when no audio has been made yet. */
function estimate(text: string): Spoken {
  const duration = Math.max(1.5, text.length / CHARS_PER_SECOND);
  return { text, file: null, duration: duration + TAIL_SECONDS, words: spreadWords(text, duration) };
}

export function cachedSpeech(line: Line): Spoken | null {
  const base = basePath(line);
  if (!existsSync(`${base}.mp3`) || !existsSync(`${base}.json`)) return null;
  const meta = JSON.parse(readFileSync(`${base}.json`, "utf8")) as { duration: number; words: Word[] };
  return { text: line.text, file: `${base}.mp3`, duration: meta.duration + TAIL_SECONDS, words: meta.words };
}

/** Narration for one sentence: cached audio, or an estimate when `allowEstimate` (rehearsals). */
export function speechFor(line: Line, allowEstimate = false): Spoken {
  const cached = cachedSpeech(line);
  if (cached) return cached;
  if (allowEstimate) return estimate(line.text);
  throw new Error(`No narration audio yet for: "${line.text.slice(0, 50)}…". Run \`npm run video:tts\` first.`);
}

async function synthesizeMac(line: Line): Promise<Spoken> {
  const base = basePath(line);
  const aiff = `${base}.aiff`;
  // `say` occasionally writes its file and then never exits; time it out and retry.
  for (let attempt = 1; ; attempt++) {
    rmSync(aiff, { force: true });
    try {
      await run("say", ["-v", MAC_VOICE, "-r", String(MAC_RATE), "-o", aiff, line.text], SAY_TIMEOUT_MS);
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      console.warn(`  ⚠ say: ${(err as Error).message}; retrying`);
    }
  }
  await ffmpeg(["-i", aiff, "-af", "silenceremove=stop_periods=-1:stop_duration=0.4:stop_threshold=-50dB", "-codec:a", "libmp3lame", "-q:a", "2", `${base}.mp3`]);
  rmSync(aiff, { force: true });
  const duration = await probeDuration(`${base}.mp3`);
  const words = spreadWords(line.text, duration);
  writeFileSync(`${base}.json`, JSON.stringify({ text: line.text, duration, words }, null, 1));
  return { text: line.text, file: `${base}.mp3`, duration: duration + TAIL_SECONDS, words };
}

async function synthesizeEleven(line: Line): Promise<Spoken> {
  const key = apiKey();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set (export it, or put it in video/.env.local).");
  const voice = ELEVEN_VOICES[line.role ?? "narrator"];
  const res = await fetch(`${ELEVEN_API}/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text: line.text, model_id: MODEL_ID, voice_settings: ELEVEN_SETTINGS, previous_text: line.prev || undefined, next_text: line.next || undefined }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { audio_base64: string; alignment: Alignment };
  const base = basePath(line);
  writeFileSync(`${base}.mp3`, Buffer.from(body.audio_base64, "base64"));
  const duration = await probeDuration(`${base}.mp3`);
  const words = toWords(body.alignment);
  writeFileSync(`${base}.json`, JSON.stringify({ text: line.text, duration, words }, null, 1));
  return { text: line.text, file: `${base}.mp3`, duration: duration + TAIL_SECONDS, words };
}

/** Runs Kokoro once for many lines (the model loads once), then stores MP3 + word timings per line. */
async function synthesizeKokoro(lines: Line[]): Promise<void> {
  const jobs = lines.map((line) => ({
    text: line.text,
    voice: KOKORO_VOICES[line.role ?? "narrator"],
    speed: KOKORO_SPEED,
    wav: `${basePath(line)}.wav`,
    json: `${basePath(line)}.kokoro.json`,
  }));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(KOKORO_PYTHON, [KOKORO_SCRIPT], { stdio: ["pipe", "inherit", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Kokoro exited ${code}: ${err.slice(-1500)}`))));
    child.stdin.end(JSON.stringify(jobs));
  });
  for (const [i, line] of lines.entries()) {
    const base = basePath(line);
    await ffmpeg(["-i", jobs[i].wav, "-codec:a", "libmp3lame", "-q:a", "2", `${base}.mp3`]);
    const raw = JSON.parse(readFileSync(jobs[i].json, "utf8")) as { words: Word[] };
    const duration = await probeDuration(`${base}.mp3`);
    writeFileSync(`${base}.json`, JSON.stringify({ text: line.text, duration, words: mergePunctuation(raw.words) }, null, 1));
    rmSync(jobs[i].wav, { force: true });
    rmSync(jobs[i].json, { force: true });
  }
}

/** Makes narration for every line that isn't cached yet, using the current provider. */
export async function synthesizeAll(lines: Line[]): Promise<void> {
  mkdirSync(TTS_DIR, { recursive: true });
  const missing = lines.filter((l) => !cachedSpeech(l));
  if (!missing.length) return;
  const p = provider();
  if (p === "kokoro") return synthesizeKokoro(missing);
  for (const line of missing) await (p === "elevenlabs" ? synthesizeEleven(line) : synthesizeMac(line));
}

export async function listVoices(): Promise<{ voice_id: string; name: string; labels: Record<string, string> }[]> {
  const key = apiKey();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set.");
  const res = await fetch(`${ELEVEN_API}/voices`, { headers: { "xi-api-key": key } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
  return ((await res.json()) as { voices: { voice_id: string; name: string; labels: Record<string, string> }[] }).voices;
}
