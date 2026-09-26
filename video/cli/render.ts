import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SCENES, type Scene } from "../script";
import type { Take } from "../lib/capture";
import { narrationFor } from "../lib/narration";
import { editScene, type Overlay, type SceneEdit } from "../lib/timeline";
import { cuesFor, tidy, toAss, toSrt, toVtt, type Cue } from "../lib/subs";
import { ffmpeg, filterPath, probe } from "../lib/ffmpeg";
import { BAND_COLOR, FINAL_DIR, FRAME, OUTPUT, TAKES_DIR } from "../lib/paths";
import { provider, type Spoken } from "../lib/tts";
import { chapters, renderThumbnail, writeUploadNotes } from "../lib/youtube";

/**
 * Assembles the final video from the recorded takes and the narration:
 *   out/final/intune-demo.mp4 (1920×1080, 30 fps, H.264 + AAC, captions burned in), .srt and .vtt.
 *   npm run video:render
 *   npm run video:render -- --estimate   draft with silent audio and estimated caption timing (no ElevenLabs yet)
 */
const estimate = process.argv.includes("--estimate");
const FADE = 0.25;
const frameUp = (s: number) => Math.ceil(s * OUTPUT.fps) / OUTPUT.fps;

interface Built {
  scene: Scene;
  edit: SceneEdit;
  narration: Spoken[];
  video: string;
  duration: number;
}

async function buildScene(scene: Scene): Promise<Built> {
  const dir = path.join(TAKES_DIR, scene.id);
  const takeFile = path.join(dir, "take.json");
  if (!existsSync(takeFile)) throw new Error(`No recording for scene "${scene.id}". Run: npm run video:record -- --scene ${scene.id}`);
  const take = JSON.parse(readFileSync(takeFile, "utf8")) as Take;
  const narration = narrationFor(scene, estimate);
  const edit = editScene(
    take,
    narration.map((n) => n.duration),
    scene.beats.map((b) => b.note),
  );
  const duration = frameUp(edit.duration);
  const list = ["ffconcat version 1.0", ...edit.entries.flatMap((e) => [`file '${e.file}'`, `duration ${e.duration.toFixed(4)}`])];
  list.push(`file '${edit.entries[edit.entries.length - 1].file}'`);
  writeFileSync(path.join(dir, "edit.ffconcat"), list.join("\n") + "\n");
  const video = path.join(dir, "scene.mp4");
  const vf = [
    `fps=${OUTPUT.fps}`,
    `scale=${FRAME.width}:${FRAME.height}:flags=lanczos`,
    `pad=${OUTPUT.width}:${OUTPUT.height}:0:0:color=${BAND_COLOR}`,
    `tpad=stop_mode=clone:stop_duration=2`,
    `fade=t=in:st=0:d=${FADE}`,
    `fade=t=out:st=${(duration - FADE).toFixed(3)}:d=${FADE}`,
    "format=yuv420p",
  ].join(",");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", path.join(dir, "edit.ffconcat"), "-vf", vf, "-t", duration.toFixed(3), "-r", String(OUTPUT.fps), "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-an", video]);
  console.log(`  ${scene.id.padEnd(14)} ${duration.toFixed(1)} s`);
  return { scene, edit, narration, video, duration };
}

/** One narration track: each sentence starts with its beat and is padded with silence to the beat's length. */
async function buildAudio(built: Built[]): Promise<string> {
  const dir = path.join(FINAL_DIR, "audio");
  mkdirSync(dir, { recursive: true });
  const parts: string[] = [];
  for (const b of built) {
    for (const [i, beat] of b.edit.beats.entries()) {
      const isLast = i === b.edit.beats.length - 1;
      const length = isLast ? b.duration - beat.start : beat.duration;
      const out = path.join(dir, `${b.scene.id}-${i}.wav`);
      const file = b.narration[i].file;
      if (file && !estimate) {
        await ffmpeg(["-i", file, "-af", `apad=whole_dur=${length.toFixed(3)},atrim=0:${length.toFixed(3)}`, "-ar", "48000", "-ac", "2", out]);
      } else {
        await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", length.toFixed(3), out]);
      }
      parts.push(`file '${out}'`);
    }
  }
  const list = path.join(dir, "narration.txt");
  writeFileSync(list, parts.join("\n") + "\n");
  const wav = path.join(dir, "narration.wav");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", wav]);
  return wav;
}

function buildCaptions(built: Built[]): { cues: Cue[]; overlays: Overlay[]; labels: Overlay[] } {
  const cues: Cue[] = [];
  const overlays: Overlay[] = [];
  const labels: Overlay[] = [];
  let offset = 0;
  for (const b of built) {
    b.edit.beats.forEach((beat, i) => cues.push(...cuesFor(b.narration[i].words, offset + beat.start)));
    overlays.push(...b.edit.overlays.map((o) => ({ ...o, start: o.start + offset, end: o.end + offset })));
    if (b.scene.label) labels.push({ start: offset + 0.3, end: offset + b.duration - 0.3, text: b.scene.label });
    offset += b.duration;
  }
  return { cues: tidy(cues), overlays, labels };
}

mkdirSync(FINAL_DIR, { recursive: true });
console.log(`Rendering${estimate ? " a draft (silent, estimated captions)" : ""}…`);
const built: Built[] = [];
for (const scene of SCENES) built.push(await buildScene(scene));

const sceneList = path.join(FINAL_DIR, "scenes.txt");
writeFileSync(sceneList, built.map((b) => `file '${b.video}'`).join("\n") + "\n");
const joined = path.join(FINAL_DIR, "joined.mp4");
await ffmpeg(["-f", "concat", "-safe", "0", "-i", sceneList, "-c", "copy", joined]);

const narration = await buildAudio(built);
const { cues, overlays, labels } = buildCaptions(built);
const base = path.join(FINAL_DIR, estimate ? "intune-demo-draft" : "intune-demo");
writeFileSync(`${base}.srt`, toSrt(cues));
writeFileSync(`${base}.vtt`, toVtt(cues));
writeFileSync(`${base}.ass`, toAss(cues, overlays, labels));

await ffmpeg([
  "-i", joined,
  "-i", narration,
  "-vf", `subtitles='${filterPath(`${base}.ass`)}'`,
  "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
  "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", String(OUTPUT.fps),
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
  "-shortest", "-movflags", "+faststart",
  `${base}.mp4`,
]);
if (!estimate) {
  const chapterLines = chapters(built);
  writeUploadNotes(path.join(FINAL_DIR, "YOUTUBE.md"), chapterLines, provider() === "elevenlabs" ? "ElevenLabs" : "macOS text-to-speech");
  await renderThumbnail(path.join(FINAL_DIR, "intune-thumbnail.jpg"));
  console.log(`YouTube: ${path.join(FINAL_DIR, "YOUTUBE.md")} (title, description, chapters) and intune-thumbnail.jpg`);
}
const total = built.reduce((n, b) => n + b.duration, 0);
console.log(`Done: ${base}.mp4 (${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, "0")}), plus .srt and .vtt`);
console.log(await probe(`${base}.mp4`));
