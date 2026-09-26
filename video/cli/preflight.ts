import { chromium } from "@playwright/test";
import { hasApiKey } from "../lib/tts";
import { run } from "../lib/ffmpeg";
import { signedInPage } from "../lib/actions";
import { BASE_URL } from "../lib/paths";

/** Checks everything the pipeline needs before spending time or credits. Never prints secrets. */
const results: [string, boolean, string?][] = [];
const check = async (name: string, fn: () => Promise<string | void>) => {
  try {
    results.push([name, true, (await fn()) ?? undefined]);
  } catch (err) {
    results.push([name, false, err instanceof Error ? err.message.slice(0, 160) : String(err)]);
  }
};

await check("ElevenLabs key present", async () => {
  if (!hasApiKey()) throw new Error("set ELEVENLABS_API_KEY or video/.env.local");
});
await check("ffmpeg with subtitles + libx264", async () => {
  const filters = await run("ffmpeg", ["-hide_banner", "-filters"]);
  const encoders = await run("ffmpeg", ["-hide_banner", "-encoders"]);
  if (!filters.includes(" subtitles ") || !encoders.includes("libx264")) throw new Error("rebuild ffmpeg with libass and libx264");
});
await check(`site healthy (${BASE_URL})`, async () => {
  const res = await fetch(`${BASE_URL}/api/health`);
  if (!res.ok) throw new Error(`status ${res.status}`);
});

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
try {
  await check("demo sign-in and seeded circles", async () => {
    const { context, page } = await signedInPage(browser, "maya");
    for (const name of [/Weekend Hangout/, /Board Game Night/, /Priya Chen/]) await page.getByRole("link", { name }).first().waitFor({ timeout: 10_000 });
    await context.close();
  });
  await check("AI answers (plan draft, not posted)", async () => {
    const { context, page } = await signedInPage(browser, "priya");
    await page.getByRole("link", { name: /Weekend Hangout/ }).last().click();
    await page.getByRole("button", { name: "Plan it together" }).click();
    const sheet = page.getByRole("dialog", { name: "Plan it together" });
    const t = Date.now();
    await sheet.getByRole("button", { name: "Draft a plan" }).click();
    await sheet.getByTestId("plan-card").waitFor({ timeout: 60_000 });
    await context.close();
    return `${((Date.now() - t) / 1000).toFixed(1)} s`;
  });
  await check("calls configured (pre-join opens)", async () => {
    const { context, page } = await signedInPage(browser, "maya");
    await page.getByRole("link", { name: /Board Game Night/ }).last().click();
    await page.getByRole("link", { name: "Start an audio call" }).click();
    await page.getByRole("button", { name: /Start the call|Join the call/ }).waitFor({ timeout: 20_000 });
    await context.close();
  });
} finally {
  await browser.close();
}

for (const [name, ok, info] of results) console.log(`${ok ? "✓" : "✗"} ${name}${info ? `: ${info}` : ""}`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
