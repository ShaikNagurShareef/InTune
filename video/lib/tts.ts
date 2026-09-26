import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TTS_DIR, VIDEO_DIR } from "./paths";
import { ffmpeg, probeDuration, run } from "./ffmpeg";

/**
 * ElevenLabs narration with character timings (for exact captions). Results are cached by content hash,
 * so re-renders never spend credits twice. The API key comes from the environment (or the gitignored
 * video/.env.local) and is never written or logged by this code.
 */
export const VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL"; // "Sarah", a clear premade voice
export const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: 0.95 };
const API = "https://api.elevenlabs.io/v1";
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

function apiKey(): string | null {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const local = path.join(VIDEO_DIR, ".env.local");
  if (!existsSync(local)) return null;
  const line = readFileSync(local, "utf8").split("\n").find((l) => l.startsWith("ELEVENLABS_API_KEY="));
  return line ? line.slice("ELEVENLABS_API_KEY=".length).trim().replace(/^["']|["']$/g, "") : null;
}

export const hasApiKey = (): boolean => Boolean(apiKey());

/**
 * Narration source: ElevenLabs when a key is available, otherwise the Mac's built-in voice so a complete
 * video can always be made. Force one with NARRATION=elevenlabs|mac.
 */
export const MAC_VOICE = process.env.MAC_VOICE ?? "Samantha";
const MAC_RATE = 172;
export type Provider = "elevenlabs" | "mac";
export function provider(): Provider {
  const forced = process.env.NARRATION;
  if (forced === "mac" || forced === "elevenlabs") return forced;
  return hasApiKey() ? "elevenlabs" : "mac";
}
export const providerLabel = (): string => (provider() === "elevenlabs" ? `ElevenLabs (${VOICE_ID}, ${MODEL_ID})` : `macOS voice "${MAC_VOICE}"`);

const cacheKey = (text: string, prev: string, next: string) =>
  createHash("sha256")
    .update(JSON.stringify(provider() === "elevenlabs" ? { text, prev, next, VOICE_ID, MODEL_ID, VOICE_SETTINGS } : { text, MAC_VOICE, MAC_RATE }))
    .digest("hex")
    .slice(0, 24);

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

/** The Mac's built-in voice (no account needed). Word timings are spread by length. */
async function synthesizeMac(text: string, base: string): Promise<Spoken> {
  const aiff = `${base}.aiff`;
  await run("say", ["-v", MAC_VOICE, "-r", String(MAC_RATE), "-o", aiff, text]);
  await ffmpeg(["-i", aiff, "-af", "silenceremove=stop_periods=-1:stop_duration=0.4:stop_threshold=-50dB", "-codec:a", "libmp3lame", "-q:a", "2", `${base}.mp3`]);
  rmSync(aiff, { force: true });
  const duration = await probeDuration(`${base}.mp3`);
  const words = spreadWords(text, duration);
  writeFileSync(`${base}.json`, JSON.stringify({ text, duration, words }, null, 1));
  return { text, file: `${base}.mp3`, duration: duration + TAIL_SECONDS, words };
}

export function cachedSpeech(text: string, prev = "", next = ""): Spoken | null {
  const base = path.join(TTS_DIR, cacheKey(text, prev, next));
  if (!existsSync(`${base}.mp3`) || !existsSync(`${base}.json`)) return null;
  const meta = JSON.parse(readFileSync(`${base}.json`, "utf8")) as { duration: number; words: Word[] };
  return { text, file: `${base}.mp3`, duration: meta.duration + TAIL_SECONDS, words: meta.words };
}

/** Narration for one sentence: cached audio, or an estimate when `allowEstimate` (rehearsals). */
export function speechFor(text: string, prev = "", next = "", allowEstimate = false): Spoken {
  const cached = cachedSpeech(text, prev, next);
  if (cached) return cached;
  if (allowEstimate) return estimate(text);
  throw new Error(`No narration audio yet for: "${text.slice(0, 50)}…". Run \`npm run video:tts\` first.`);
}

export async function synthesize(text: string, prev = "", next = ""): Promise<Spoken> {
  const cached = cachedSpeech(text, prev, next);
  if (cached) return cached;
  mkdirSync(TTS_DIR, { recursive: true });
  if (provider() === "mac") return synthesizeMac(text, path.join(TTS_DIR, cacheKey(text, prev, next)));
  const key = apiKey();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set (export it, or put it in video/.env.local).");
  mkdirSync(TTS_DIR, { recursive: true });
  const res = await fetch(`${API}/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS, previous_text: prev || undefined, next_text: next || undefined }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { audio_base64: string; alignment: Alignment };
  const base = path.join(TTS_DIR, cacheKey(text, prev, next));
  writeFileSync(`${base}.mp3`, Buffer.from(body.audio_base64, "base64"));
  const duration = await probeDuration(`${base}.mp3`);
  writeFileSync(`${base}.json`, JSON.stringify({ text, duration, words: toWords(body.alignment) }, null, 1));
  return { text, file: `${base}.mp3`, duration: duration + TAIL_SECONDS, words: toWords(body.alignment) };
}

export async function listVoices(): Promise<{ voice_id: string; name: string; labels: Record<string, string> }[]> {
  const key = apiKey();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set.");
  const res = await fetch(`${API}/voices`, { headers: { "xi-api-key": key } });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
  return ((await res.json()) as { voices: { voice_id: string; name: string; labels: Record<string, string> }[] }).voices;
}
