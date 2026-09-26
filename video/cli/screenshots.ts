import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";
import { signedInPage, type DemoUser } from "../lib/actions";
import { BASE_URL, VIDEO_DIR } from "../lib/paths";

/**
 * README screenshots from the live app with the demo accounts (real AI output, nothing mocked).
 *   npm run screenshots                  all
 *   npm run screenshots -- --only plan   one (repeatable)
 * Writes media/screenshots/*.jpg. Drafts and plans are opened but never sent or posted.
 */
const OUT = path.join(VIDEO_DIR, "..", "media", "screenshots");
const DESKTOP = { width: 1440, height: 860 };
const PHONE = { width: 390, height: 844 };
const args = process.argv.slice(2);
const only = args.flatMap((a, i) => (a === "--only" ? [args[i + 1]] : []));
const wanted = (name: string) => !only.length || only.includes(name);

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
mkdirSync(OUT, { recursive: true });

async function open(user: DemoUser, viewport = DESKTOP) {
  const session = await signedInPage(browser, user, { viewport, scale: 2 });
  return session;
}

/** Hides the demo cursor, waits for things to settle, and saves a JPEG (whole page or one element). */
async function shoot(page: Page, name: string, target?: Locator) {
  await page.addStyleTag({ content: "#demo-cursor{display:none!important}" });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(700);
  const file = path.join(OUT, `${name}.jpg`);
  await (target ?? page).screenshot({ path: file, type: "jpeg", quality: 82 });
  console.log(`  ✓ ${name}`);
}

const chat = async (page: Page, name: RegExp) => {
  await page.goto(`${BASE_URL}/circles`);
  await page.getByRole("link", { name }).last().click();
  await page.waitForURL(/\/circles\/[0-9a-f-]+$/);
  await page.waitForTimeout(1500);
};

try {
  if (wanted("chats")) {
    const { context, page } = await open("maya");
    await chat(page, /Board Game Night/);
    await shoot(page, "chats");
    await context.close();
  }

  if (wanted("translate-in")) {
    const { context, page } = await open("maya");
    await chat(page, /Priya Chen\s*Are you still OK/);
    const item = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: /Translate this message|Hide translation/ }) })
      .filter({ hasText: "bring something small" })
      .last();
    const translate = item.getByRole("button", { name: "Translate this message" });
    if (await translate.isVisible()) await translate.click();
    await item.getByText("What they’re asking").waitFor({ timeout: 60_000 });
    await item.scrollIntoViewIfNeeded();
    // A tight crop: the message and its full translation.
    await shoot(page, "translate-in", item);
    await context.close();
  }

  if (wanted("translate-out")) {
    const { context, page } = await open("leo");
    await chat(page, /Board Game Night/);
    await page.getByLabel("Your message").fill("sat ok. no loud music pls. leave 8 maybe");
    await page.getByRole("button", { name: "Translate", exact: true }).click();
    await page.getByRole("heading", { name: /Check the translation/ }).waitFor({ timeout: 60_000 });
    await shoot(page, "translate-out");
    await context.close(); // never sent
  }

  if (wanted("plan")) {
    const { context, page } = await open("priya");
    await chat(page, /Weekend Hangout/);
    await page.getByRole("button", { name: "Plan it together" }).click();
    const sheet = page.getByRole("dialog", { name: "Plan it together" });
    await sheet.getByLabel("What are we planning? (optional)").fill("our Sunday meetup");
    await sheet.getByRole("button", { name: "Draft a plan" }).click();
    await sheet.getByTestId("plan-card").waitFor({ timeout: 60_000 });
    await shoot(page, "plan");
    await context.close(); // never posted
  }

  if (wanted("profile")) {
    const { context, page } = await open("maya");
    await page.goto(`${BASE_URL}/me`);
    await page.getByRole("heading", { name: "How to talk with me" }).waitFor();
    await shoot(page, "profile");
    await context.close();
  }

  if (wanted("call")) {
    const maya = await open("maya");
    const leo = await signedInPage(browser, "leo", { viewport: DESKTOP, scale: 1, fakeSpeech: true });
    await chat(maya.page, /Board Game Night/);
    await chat(leo.page, /Board Game Night/);
    await maya.page.getByRole("link", { name: "Start an audio call" }).click();
    await maya.page.getByRole("button", { name: /Start the call|Join the call/ }).click();
    await leo.page.reload();
    await leo.page.getByRole("status").filter({ hasText: "Call in progress" }).getByRole("link", { name: "Join" }).click({ timeout: 30_000 });
    await leo.page.getByRole("button", { name: "Join the call" }).click();
    const people = maya.page.getByRole("list", { name: "People in the call" }).getByRole("listitem");
    await people.nth(1).waitFor({ timeout: 30_000 });
    // Simulated speech on Leo's side; the interpretation Maya sees is live AI.
    // Wait until Leo's captions are listening (they start once he is connected with his mic on).
    const line = "Honestly it's whatever, but maybe we could start the long game at seven, if that's okay?";
    for (let i = 0; i < 20; i++) {
      const said = await leo.page.evaluate((t) => (window as unknown as { __say: (s: string) => Promise<boolean> }).__say(t), line);
      if (said) break;
      await leo.page.waitForTimeout(1000);
    }
    await maya.page.getByText("In plain words").last().waitFor({ timeout: 60_000 });
    await leo.page.getByRole("button", { name: "Send a signal" }).click();
    await leo.page.getByRole("group", { name: "Signals" }).getByRole("button", { name: "Please slow down" }).click();
    await people.filter({ hasText: "Leo" }).getByText("Please slow down").waitFor({ timeout: 15_000 });
    await shoot(maya.page, "call");
    // Tidy up: end the call for everyone.
    await maya.page.getByRole("button", { name: "More options" }).click();
    await maya.page.getByRole("button", { name: /End call for everyone/ }).click();
    await maya.page.getByRole("button", { name: "End for all" }).click();
    await leo.context.close();
    await maya.context.close();
  }

  if (wanted("mobile")) {
    const { context, page } = await open("maya", PHONE);
    await page.goto(`${BASE_URL}/circles`);
    await page.getByRole("heading", { name: "Chats", exact: true }).waitFor();
    await shoot(page, "mobile-chats");
    await chat(page, /Priya Chen\s*Are you still OK/);
    const priya = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: /Translate this message|Hide translation/ }) })
      .filter({ hasText: "bring something small" })
      .last();
    await priya.getByText("What they’re asking").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await priya.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await shoot(page, "mobile-translate");
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`Saved to ${OUT}`);
