import type { Scene } from "../script";
import { speechFor, synthesizeAll, type Line, type Spoken } from "./tts";

/** Each beat's sentence, with its neighbours (for natural flow) and the scene's speaker. */
export function linesFor(scene: Scene): Line[] {
  return scene.beats.map((b, i) => ({
    text: b.say,
    prev: scene.beats[i - 1]?.say ?? "",
    next: scene.beats[i + 1]?.say ?? "",
    role: scene.voice ?? "narrator",
  }));
}

export function narrationFor(scene: Scene, allowEstimate: boolean): Spoken[] {
  return linesFor(scene).map((line) => speechFor(line, allowEstimate));
}

export async function synthesizeScenes(scenes: Scene[]): Promise<void> {
  await synthesizeAll(scenes.flatMap(linesFor));
}
