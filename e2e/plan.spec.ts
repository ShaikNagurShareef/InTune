import { expect, test } from "@playwright/test";
import { addKey, createCircle, inviteAndJoin, sendMine, signUp } from "./helpers";

test("plan it together: AI drafts a plan from the chat, the organiser approves it, everyone sees it", async ({ browser }) => {
  const nia = await signUp(browser, "Nia");
  const olu = await signUp(browser, "Olu");
  await createCircle(nia.page, "Picnic crew");
  await inviteAndJoin(nia.page, olu.page, olu.email);
  const circleUrl = olu.page.url();
  await sendMine(olu.page, "Sunday works. Somewhere quiet please.");

  await addKey(nia.page);
  await nia.page.goto(circleUrl);
  await sendMine(nia.page, "I can bring snacks.");
  await nia.page.getByRole("button", { name: "Plan it together" }).click();
  const sheet = nia.page.getByRole("dialog", { name: "Plan it together" });
  await sheet.getByLabel("What are we planning? (optional)").fill("a Sunday picnic");
  await sheet.getByRole("button", { name: "Draft a plan" }).click();

  // Private plan card, grounded in members and the chat.
  const card = sheet.getByTestId("plan-card");
  // First use compiles the route in dev, so allow extra time.
  await expect(card).toContainText("Only you see this", { ignoreCase: true, timeout: 60_000 });
  await expect(card).toContainText("Sunday picnic");
  await expect(card.getByText("Not agreed yet")).toBeVisible();
  await expect(card).toContainText("Can we meet from 10:00 am to 12:00 pm?");

  // Exact review, then approval posts it.
  await sheet.getByRole("button", { name: "Review and post" }).click();
  await expect(sheet.getByRole("heading", { name: "Check the plan before posting" })).toBeVisible();
  await sheet.getByRole("button", { name: "Approve and post" }).click();
  await expect(sheet).toBeHidden();

  const oluThread = olu.page.getByRole("region", { name: "Picnic crew" });
  const posted = oluThread.getByRole("listitem").filter({ hasText: "📋 Plan: Sunday picnic" });
  await expect(posted).toBeVisible({ timeout: 15_000 });
  await expect(posted.getByText("AI-assisted · approved by sender")).toBeVisible();
});
