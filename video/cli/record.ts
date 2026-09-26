import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium, type Browser, type Page } from "@playwright/test";
import { SCENES, sceneById, type Scene, type SceneCtx } from "../script";
import { Director, signedInPage } from "../lib/actions";
import { CURSOR_SCRIPT, Recorder } from "../lib/capture";
import { narrationFor } from "../lib/narration";
import { voiceCredit } from "../lib/tts";
import { CARDS_DIR, DEVICE_SCALE, TAKES_DIR, VIEWPORT } from "../lib/paths";

/**
 * Records scenes against the live app, paced by the narration.
 *   npm run video:record                      all scenes
 *   npm run video:record -- --scene plan      one scene (repeatable flag)
 *   npm run video:record -- --rehearse        run the flows without recording (checks selectors and timing)
 *   npm run video:record -- --seed            reset the demo accounts first (needs DATABASE_URL in your shell)
 *   npm run video:record -- --headed          watch it happen
 */
const args = process.argv.slice(2);
const rehearse = args.includes("--rehearse");
// Draft mode before any narration exists: pace with estimated sentence lengths.
const estimate = rehearse || args.includes("--estimate");
const only = args.flatMap((a, i) => (a === "--scene" ? [args[i + 1]] : []));
const scenes = only.length ? only.map(sceneById) : SCENES;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function seed() {
  if (!process.env.DATABASE_URL) throw new Error("--seed needs DATABASE_URL (the production database) in your shell.");
  console.log("Resetting demo accounts…");
  const res = spawnSync("npx", ["tsx", "scripts/seed-demo.ts"], { stdio: "inherit", env: process.env });
  if (res.status !== 0) throw new Error("Seeding failed.");
}

async function cardPage(browser: Browser, card: string): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(CARDS_DIR, `${card}.html`)).href);
  await page.evaluate(() => document.fonts.ready);
  // Credit the narration voice actually used.
  await page.evaluate((credit) => {
    const el = document.getElementById("voice-credit");
    if (el) el.textContent = credit;
  }, voiceCredit());
  await page.waitForTimeout(400);
  return page;
}

async function recordScene(browser: Browser, scene: Scene): Promise<void> {
  const narration = narrationFor(scene, estimate);
  const dir = path.join(TAKES_DIR, scene.id);
  const page = scene.kind === "card" ? await cardPage(browser, scene.card as string) : (await signedInPage(browser, scene.as ?? "maya")).page;
  const recorder = rehearse ? null : new Recorder(page, scene.id, dir);
  const d = new Director(page, recorder, path.join(dir, "fail"));
  const ctx: SceneCtx = {
    d,
    page,
    browser,
    extras: {},
    card: async (step) => {
      await page.evaluate((s) => document.body.setAttribute("data-step", String(s)), step);
    },
  };
  console.log(`▶ ${scene.id}${rehearse ? " (rehearsal)" : ""}`);
  try {
    await scene.setup?.(ctx);
    await recorder?.start();
    await sleep(300);
    for (const [i, beat] of scene.beats.entries()) {
      const started = Date.now() / 1000;
      const cutBefore = d.cutSeconds;
      recorder?.mark(`beat:${i}:start`);
      await beat.run?.(ctx);
      const onScreen = Date.now() / 1000 - started - (d.cutSeconds - cutBefore);
      const remaining = narration[i].duration - onScreen;
      if (remaining > 0) await sleep(remaining * 1000);
      recorder?.mark(`beat:${i}:end`);
      const drift = onScreen - narration[i].duration;
      console.log(`   beat ${i + 1}/${scene.beats.length}  narration ${narration[i].duration.toFixed(1)} s  on screen ${onScreen.toFixed(1)} s${drift > 0.5 ? `  (+${drift.toFixed(1)} s over)` : ""}`);
    }
    await sleep(250);
    await recorder?.stop();
  } catch (err) {
    await d.fail(`error-${scene.id}`);
    throw err;
  } finally {
    await scene.teardown?.(ctx).catch(() => undefined);
    await page.context().close();
  }
}

if (args.includes("--seed")) seed();
const browser = await chromium.launch({
  headless: !args.includes("--headed"),
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
try {
  for (const scene of scenes) await recordScene(browser, scene);
  console.log(rehearse ? "Rehearsal passed." : `Recorded ${scenes.length} scene(s) to ${TAKES_DIR}`);
} finally {
  await browser.close();
}
