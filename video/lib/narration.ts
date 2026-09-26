import type { Scene } from "../script";
import { speechFor, synthesize, type Spoken } from "./tts";

/** Neighbouring sentences in the same scene, so each line is spoken with natural flow. */
function contextFor(scene: Scene, i: number): { prev: string; next: string } {
  return { prev: scene.beats[i - 1]?.say ?? "", next: scene.beats[i + 1]?.say ?? "" };
}

export function narrationFor(scene: Scene, allowEstimate: boolean): Spoken[] {
  return scene.beats.map((b, i) => {
    const { prev, next } = contextFor(scene, i);
    return speechFor(b.say, prev, next, allowEstimate);
  });
}

export async function synthesizeScene(scene: Scene): Promise<Spoken[]> {
  const out: Spoken[] = [];
  for (const [i, b] of scene.beats.entries()) {
    const { prev, next } = contextFor(scene, i);
    out.push(await synthesize(b.say, prev, next));
  }
  return out;
}
