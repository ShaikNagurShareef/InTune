import { expect, type Browser, type Page } from "@playwright/test";

const FAKE_KEY = "fake-e2e-key-for-stubbed-tests-only";
const run = Date.now().toString(36);

export async function signUp(browser: Browser, name: string): Promise<{ page: Page; email: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `${name.toLowerCase()}-${run}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name people in your circles will see").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Chats", exact: true })).toBeVisible();
  return { page, email };
}

export async function addKey(page: Page) {
  await page.goto("/settings");
  await page.getByLabel(/Paste your Google Gemini API key/).fill(FAKE_KEY);
  await page.getByRole("button", { name: "Check and save" }).click();
  await expect(page.getByText("Key works.")).toBeVisible();
}

export async function createCircle(page: Page, name: string) {
  await page.goto("/circles?new=1");
  await page.getByRole("tab", { name: "New circle" }).click();
  await page.getByLabel("Circle name").fill(name);
  await page.getByRole("button", { name: "Create circle" }).click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

export async function inviteAndJoin(owner: Page, guest: Page, guestEmail: string) {
  await owner.getByLabel("Their email").fill(guestEmail);
  await owner.getByRole("button", { name: "Send invitation" }).click();
  await expect(owner.getByText("Invitation sent.")).toBeVisible();
  await guest.goto("/circles");
  await guest.getByRole("tab", { name: /Requests/ }).click();
  await guest.getByRole("button", { name: "Join circle" }).click();
  await guest.waitForURL(/\/circles\/[0-9a-f-]+$/);
}

export async function sendMine(page: Page, text: string) {
  await page.getByLabel("Your message").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sent." })).toBeVisible();
}
