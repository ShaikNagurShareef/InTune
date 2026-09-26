import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import type { Scene } from "../script";
import { CARDS_DIR } from "./paths";

const stamp = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** YouTube chapters: one per scene that starts a chapter (YouTube needs the first at 0:00 and each ≥ 10 s). */
export function chapters(scenes: { scene: Scene; duration: number }[]): string[] {
  const out: string[] = [];
  let t = 0;
  for (const { scene, duration } of scenes) {
    if (scene.chapter) out.push(`${stamp(t)} ${scene.chapter}`);
    t += duration;
  }
  return out;
}

export function writeUploadNotes(file: string, chapterLines: string[], voiceCredit: string): void {
  const text = `# YouTube upload

**Video file:** intune-demo.mp4 (1920×1080, 30 fps, H.264 + AAC, captions burned in)
**Thumbnail:** intune-thumbnail.jpg (1280×720)
**Captions (optional):** intune-demo.srt. The video already shows captions; uploading the SRT also lets YouTube translate them. Keep "captions on by default" off, so they don't appear twice.

## Title
InTune: an AI interpreter between people who communicate differently | Coding Claws, HackGT 13

## Description
It started with a friend: one of us grew up with a close friend who found conversations hard and often got lost in groups. InTune helps autistic adults and the people they care about understand each other. Nobody is asked to change how they talk: AI interprets in both directions, inside small private circles.

• Messages you receive: in plain words, what they're asking, whether a reply is needed, and what's unclear (only you see it)
• Messages you send: your shorthand in clear words, sent only after you approve the exact text
• Plan it together: a scattered group chat becomes one plan that works for everyone
• Personal phrases: your own expressions (like "red light") translated with the meaning you saved
• Private circles: join only by invitation, and see who will read your posts before you join
• Live calls: captions, a private AI interpreter, "say it for me", and one-tap signals

Try it: https://intune-eta.vercel.app (demo accounts on the sign-in page)
Code: https://github.com/ShaikNagurShareef/InTune

Built by Coding Claws for HackGT 13 · Meta challenge: Bringing People Closer Together with AI.
Team: Nagur Shareef Shaik, Sahith Reddy Thummala, Pranav Nagothu, Geethanjali Nagaboina.
Demo people are fictional. Every AI result in this video is live; long AI waits are shortened and labelled. In the call, Leo's speech is simulated for the recording (labelled on screen); the interpretation is live AI.
Research: Crompton et al., Autism (2020); Grace et al., Autism (2022); Milton (2012).
Narration voice: ${voiceCredit}.

Chapters
${chapterLines.join("\n")}

## Tags
InTune, autism, accessibility, AI, communication, HackGT, Meta, assistive technology, neurodiversity
`;
  writeFileSync(file, text);
}

export async function renderThumbnail(file: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(pathToFileURL(path.join(CARDS_DIR, "thumbnail.html")).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.screenshot({ path: file, type: "jpeg", quality: 92 });
  } finally {
    await browser.close();
  }
}
