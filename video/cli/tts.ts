import { SCENES } from "../script";
import { cachedSpeech, listVoices, providerLabel } from "../lib/tts";
import { linesFor, narrationFor, synthesizeScenes } from "../lib/narration";

/**
 * Makes the narration audio, reusing cached lines.
 *   npm run video:tts               synthesize anything missing
 *   npm run video:tts -- --dry      show what would be synthesized
 *   npm run video:tts -- --voices   list ElevenLabs voices available to your key
 * Voice: ElevenLabs if a key is set, else Kokoro (local neural TTS), else the Mac voice. Force with NARRATION=…
 */
const args = process.argv.slice(2);

if (args.includes("--voices")) {
  for (const v of await listVoices()) console.log(`${v.voice_id}  ${v.name}  ${Object.values(v.labels ?? {}).join(", ")}`);
  process.exit(0);
}

const lines = SCENES.flatMap(linesFor);
const total = lines.reduce((n, l) => n + l.text.length, 0);
const missing = lines.filter((l) => !cachedSpeech(l));
console.log(`Narration: ${lines.length} lines, ${total} characters, ${missing.length} not yet made · voice: ${providerLabel()}`);
if (args.includes("--dry")) process.exit(0);

await synthesizeScenes(SCENES);
let seconds = 0;
for (const scene of SCENES) {
  const spoken = narrationFor(scene, false);
  const d = spoken.reduce((n, s) => n + s.duration, 0);
  seconds += d;
  console.log(`  ${scene.id.padEnd(14)} ${spoken.length} lines · ${d.toFixed(1)} s${scene.voice === "creator" ? " (creator voice)" : ""}`);
}
console.log(`Total narration ≈ ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`);
