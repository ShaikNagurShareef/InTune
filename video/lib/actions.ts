import path from "node:path";
import { mkdirSync } from "node:fs";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";
import { BASE_URL, DEVICE_SCALE, VIEWPORT } from "./paths";
import { CURSOR_SCRIPT, FAKE_SPEECH_SCRIPT, type Recorder } from "./capture";

export const DEMO_PASSWORD = "InTune-demo-2026";
export type DemoUser = "maya" | "leo" | "jordan" | "priya" | "guest";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const AI_TIMEOUT_MS = 45_000;
const AI_ATTEMPTS = 3;
/** Of each AI wait, this much is kept on screen: the start (it's working) and the reveal. */
export const AI_KEEP_START = 1.0;
export const AI_KEEP_END = 0.4;

export interface PageOptions {
  fakeSpeech?: boolean;
  viewport?: { width: number; height: number };
  scale?: number;
}

export async function signedInPage(browser: Browser, user: DemoUser, opts: PageOptions = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: opts.viewport ?? VIEWPORT,
    deviceScaleFactor: opts.scale ?? DEVICE_SCALE,
    permissions: ["camera", "microphone"],
    reducedMotion: "no-preference",
  });
  await context.addInitScript(CURSOR_SCRIPT);
  if (opts.fakeSpeech) await context.addInitScript(FAKE_SPEECH_SCRIPT);
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/signin`);
  await page.getByLabel("Email").fill(`${user}@intune.demo`);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.getByRole("heading", { name: "Chats", exact: true }).waitFor({ timeout: 30_000 });
  return { context, page };
}

/** Everything a scene's beats need: the recorded page, helpers that look human, and AI-wait bookkeeping. */
export class Director {
  /** Seconds of AI waiting that the edit will cut; beat pacing ignores them. */
  cutSeconds = 0;

  constructor(
    readonly page: Page,
    private readonly recorder: Recorder | null,
    readonly failDir: string,
  ) {}

  private async glide(target: Locator) {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("Target has no box (hidden?)");
    const to = { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 24) };
    await this.page.mouse.move(to.x, to.y, { steps: 22 });
    await sleep(180);
  }

  /** Moves the cursor to an element and pauses, to draw the eye without clicking. */
  async point(target: Locator, pauseMs = 600) {
    await target.waitFor({ state: "visible", timeout: 20_000 });
    await this.glide(target);
    await sleep(pauseMs);
  }

  async click(target: Locator, pauseMs = 500) {
    await target.waitFor({ state: "visible", timeout: 20_000 });
    await this.glide(target);
    await target.click();
    await sleep(pauseMs);
  }

  async type(target: Locator, text: string) {
    await this.click(target, 200);
    await target.fill("");
    await target.pressSequentially(text, { delay: 45 });
    await sleep(350);
  }

  async scrollBy(dy: number, pauseMs = 900) {
    await this.page.mouse.wheel(0, dy);
    await sleep(pauseMs);
  }

  pause = (ms: number) => sleep(ms);

  /**
   * Waits for a real AI result. The wait is marked so the edit can shorten it (labelled "sped up").
   * Retries on a visible error; never substitutes output.
   */
  async ai(label: string, trigger: () => Promise<void>, done: Locator, failed?: Locator, retry?: () => Promise<void>) {
    for (let attempt = 1; attempt <= AI_ATTEMPTS; attempt++) {
      const started = Date.now() / 1000;
      this.recorder?.mark(`ai:start:${label}`);
      await (attempt === 1 ? trigger() : (retry ?? trigger)());
      const outcome = await Promise.race([
        done.waitFor({ state: "visible", timeout: AI_TIMEOUT_MS }).then(() => "ok" as const),
        ...(failed ? [failed.waitFor({ state: "visible", timeout: AI_TIMEOUT_MS }).then(() => "failed" as const)] : []),
      ]).catch(() => "timeout" as const);
      const waited = Date.now() / 1000 - started;
      if (outcome === "ok") {
        this.recorder?.mark(`ai:end:${label}`);
        this.cutSeconds += Math.max(0, waited - AI_KEEP_START - AI_KEEP_END);
        return;
      }
      // A failed attempt (and the pause before retrying) is cut from the edit entirely:
      // no error screen ever reaches the video.
      console.warn(`  ⚠ AI step "${label}" ${outcome} (attempt ${attempt}/${AI_ATTEMPTS}, ${waited.toFixed(1)} s)`);
      await sleep(3000 * attempt);
      this.recorder?.mark(`ai:cut:${label}`);
      this.cutSeconds += Date.now() / 1000 - started;
    }
    await this.fail(`ai-${label}`);
    throw new Error(`AI step "${label}" did not succeed after ${AI_ATTEMPTS} attempts. Nothing was faked; try again later.`);
  }

  async fail(name: string) {
    mkdirSync(this.failDir, { recursive: true });
    await this.page.screenshot({ path: path.join(this.failDir, `${name}.png`) }).catch(() => undefined);
  }
}
