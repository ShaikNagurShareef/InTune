import { SCENES } from "../script";
import { cachedSpeech, hasApiKey, listVoices, MODEL_ID, VOICE_ID } from "../lib/tts";
import { synthesizeScene } from "../lib/narration";

/**
 * Makes the narration audio (ElevenLabs), reusing cached lines.
 *   npm run video:tts            synthesize anything missing
 *   npm run video:tts -- --dry   show how many characters would be spent
 *   npm run video:tts -- --voices  list voices available to your key
 */
const args = process.argv.slice(2);

if (args.includes("--voices")) {
  for (const v of await listVoices()) console.log(`${v.voice_id}  ${v.name}  ${Object.values(v.labels ?? {}).join(", ")}`);
  process.exit(0);
}

let total = 0;
let missing = 0;
for (const scene of SCENES) {
  scene.beats.forEach((b, i) => {
    total += b.say.length;
    if (!cachedSpeech(b.say, scene.beats[i - 1]?.say ?? "", scene.beats[i + 1]?.say ?? "")) missing += b.say.length;
  });
}
console.log(`Narration: ${total} characters, ${missing} not yet synthesized (voice ${VOICE_ID}, model ${MODEL_ID}).`);
if (args.includes("--dry")) process.exit(0);
if (missing > 0 && !hasApiKey()) {
  console.error("ELEVENLABS_API_KEY is not set. Export it, or put it in video/.env.local (gitignored).");
  process.exit(1);
}

let seconds = 0;
for (const scene of SCENES) {
  const lines = await synthesizeScene(scene);
  const d = lines.reduce((n, l) => n + l.duration, 0);
  seconds += d;
  console.log(`  ${scene.id.padEnd(14)} ${lines.length} lines · ${d.toFixed(1)} s`);
}
console.log(`Total narration ≈ ${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`);
