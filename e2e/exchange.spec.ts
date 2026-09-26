import { expect, test, type Browser, type Page } from "@playwright/test";

const FAKE_KEY = "fake-e2e-key-for-stubbed-tests-only";
const run = Date.now().toString(36);

async function signUp(browser: Browser, name: string): Promise<{ page: Page; email: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `${name.toLowerCase()}-${run}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name people in your circles will see").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Your circles" })).toBeVisible();
  return { page, email };
}

async function addKey(page: Page) {
  await page.goto("/settings");
  await page.getByLabel("Paste your Gemini API key").fill(FAKE_KEY);
  await page.getByRole("button", { name: "Check and save" }).click();
  await expect(page.getByText("Key works.")).toBeVisible();
}

test("G1: compose → clarify → approve → receive → simplify → reply", async ({ browser }) => {
  const ana = await signUp(browser, "Ana");
  const ben = await signUp(browser, "Ben");

  // Ana creates a circle and invites Ben by email.
  await ana.page.getByLabel("Circle name").fill("Dinner plans");
  await ana.page.getByRole("button", { name: "Create circle" }).click();
  await expect(ana.page.getByRole("heading", { name: "Dinner plans" })).toBeVisible();
  await ana.page.getByLabel("Their email (recommended)").fill(ben.email);
  await ana.page.getByRole("button", { name: "Create invitation link" }).click();
  const link = await ana.page.getByLabel("Private link — send it yourself").inputValue();

  // Ben sees who is in the circle before joining.
  await ben.page.goto(link);
  await expect(ben.page.getByRole("heading", { name: "Dinner plans" })).toBeVisible();
  await expect(ben.page.getByRole("listitem").filter({ hasText: "Ana" })).toBeVisible();
  await ben.page.getByRole("button", { name: "Join circle" }).click();
  await ben.page.waitForURL(/\/circles\/[0-9a-f-]+$/);
  const circleUrl = ben.page.url();

  // Ben composes with wording help; InTune asks instead of guessing.
  await addKey(ben.page);
  await ben.page.goto(circleUrl);
  await ben.page.getByLabel("Your message").fill("want come dinner friday loud outside?");
  await ben.page.getByRole("button", { name: "Help me word it" }).click();
  await expect(ben.page.getByRole("heading", { name: "Where would you like to sit?" })).toBeVisible();
  await ben.page.getByRole("button", { name: "Outside" }).click();

  // Exact preview with audience, then explicit approval.
  const preview = ben.page.getByLabel("Your message — exactly as it will be sent");
  await expect(preview).toHaveValue(/sit outside\?/);
  await expect(ben.page.getByText("To: Dinner plans · 2 people")).toBeVisible();
  await ben.page.getByRole("button", { name: "Approve and send" }).click();
  await expect(ben.page.getByText("✓ Sent.")).toBeVisible();

  // Ana receives it, labelled, and opens a private simpler version.
  await addKey(ana.page);
  await ana.page.goto(circleUrl);
  const incoming = ana.page.getByRole("listitem").filter({ hasText: "sit outside?" });
  await expect(incoming).toBeVisible();
  await expect(incoming.getByText("AI-assisted · approved by sender")).toBeVisible();
  await incoming.getByRole("button", { name: "Make clearer" }).click();
  await expect(incoming.getByText("only you see this")).toBeVisible();

  // Ana replies in her own words (manual path).
  await incoming.getByRole("button", { name: "↩ Reply" }).click();
  await ana.page.getByLabel("Your message").fill("Yes! Outside on Friday works.");
  await ana.page.getByRole("button", { name: "Send my own words" }).click();
  await expect(ana.page.getByText("✓ Sent.")).toBeVisible();

  // Ben sees the reply appear by polling.
  await expect(ben.page.getByText("Yes! Outside on Friday works.")).toBeVisible({ timeout: 15_000 });
  await expect(ben.page.getByText(/Replying to you/)).toBeVisible();
});

test("manual messaging works with no key, using only the keyboard", async ({ browser }) => {
  const { page } = await signUp(browser, "Kai");
  await page.getByLabel("Circle name").fill("Solo");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Solo" })).toBeVisible();
  await expect(page.getByText("Wording help is off on this device")).toBeVisible();
  await page.getByLabel("Your message").focus();
  await page.keyboard.type("Hello from the keyboard");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send my own words" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listitem").filter({ hasText: "Hello from the keyboard" })).toBeVisible();
});
