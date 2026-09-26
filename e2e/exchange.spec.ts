import { expect, test } from "@playwright/test";
import { addKey, createCircle, inviteAndJoin, sendMine, signUp } from "./helpers";

test("G1: compose → clarify → approve → receive → understand → reply", async ({ browser }) => {
  const ana = await signUp(browser, "Ana");
  const ben = await signUp(browser, "Ben");

  // Ana creates a circle and invites Ben by email — entirely inside the app.
  await createCircle(ana.page, "Dinner plans");
  await ana.page.getByLabel("Their email").fill(ben.email);
  await ana.page.getByRole("button", { name: "Send invitation" }).click();
  await expect(ana.page.getByText("Invitation sent.")).toBeVisible();

  // Ben sees the invitation in Requests, including who is in the circle, and joins.
  await ben.page.goto("/circles");
  await ben.page.getByRole("tab", { name: /Requests/ }).click();
  const invite = ben.page.getByRole("article").filter({ hasText: "Dinner plans" });
  await expect(invite.getByText("Who will read your posts: Ana")).toBeVisible();
  await invite.getByRole("button", { name: "Join circle" }).click();
  await ben.page.waitForURL(/\/circles\/[0-9a-f-]+$/);
  const circleUrl = ben.page.url();

  // Ben composes with wording help; InTune asks instead of guessing.
  await addKey(ben.page);
  await ben.page.goto(circleUrl);
  await ben.page.getByLabel("Your message").fill("want come dinner friday loud outside?");
  await ben.page.getByRole("button", { name: "Translate", exact: true }).click();
  await expect(ben.page.getByRole("heading", { name: "Where would you like to sit?" })).toBeVisible();
  await ben.page.getByRole("button", { name: "Outside" }).click();

  // Exact preview, then explicit approval.
  await expect(ben.page.getByTestId("review-preview")).toContainText("sit outside?");
  await ben.page.getByRole("button", { name: "Approve and send" }).click();
  await expect(ben.page.getByRole("status").filter({ hasText: "Sent." })).toBeVisible();

  // Ana receives it, labelled, and opens private reading help.
  await addKey(ana.page);
  await ana.page.goto(circleUrl);
  const incoming = ana.page.getByRole("listitem").filter({ hasText: "sit outside?" }).last();
  await expect(incoming.getByText("AI-assisted · approved by sender")).toBeVisible();
  await incoming.getByRole("button", { name: "Translate this message" }).click();
  await expect(incoming.getByText("only you see this")).toBeVisible();
  await expect(incoming.getByText("What they’re asking")).toBeVisible();

  // Ana replies in her own words (manual path) from the message menu.
  await incoming.getByRole("button", { name: "More actions for this message" }).click();
  await ana.page.getByRole("menuitem", { name: "Reply" }).click();
  await sendMine(ana.page, "Yes! Outside on Friday works.");

  // Ben sees the reply appear by polling.
  const benThread = ben.page.getByRole("region", { name: "Dinner plans" });
  await expect(benThread.getByText("Yes! Outside on Friday works.")).toBeVisible({ timeout: 15_000 });
  await expect(benThread.getByText(/Replied to you/)).toBeVisible();
});

test("sending your own words works using only the keyboard", async ({ browser }) => {
  const { page } = await signUp(browser, "Kai");
  await createCircle(page, "Solo");
  await page.keyboard.press("Escape");
  await page.getByLabel("Your message").focus();
  await page.keyboard.type("Hello from the keyboard");
  const send = page.getByRole("button", { name: "Send", exact: true });
  for (let i = 0; i < 15 && !(await send.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(send).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listitem").filter({ hasText: "Hello from the keyboard" }).last()).toBeVisible();
});

test("direct chat: start from New, unread in the list, tone tags, reply", async ({ browser }) => {
  const zoe = await signUp(browser, "Zoe");
  const max = await signUp(browser, "Max");
  await createCircle(zoe.page, "Book club");
  await inviteAndJoin(zoe.page, max.page, max.email);

  // Zoe starts a one-to-one chat with Max.
  await zoe.page.goto("/circles?new=1");
  await zoe.page.getByRole("dialog").getByRole("button", { name: "Max" }).click();
  await expect(zoe.page.getByText("Direct chat · only you two")).toBeVisible();
  await zoe.page.getByLabel("Your message").fill("Just us: are you free Sunday?");
  await zoe.page.getByRole("button", { name: "Add a tone" }).click();
  await zoe.page.getByRole("button", { name: "No rush" }).click();
  await zoe.page.getByRole("button", { name: "Done" }).click();
  await zoe.page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(zoe.page.getByRole("status").filter({ hasText: "Sent." })).toBeVisible();

  // Max sees it at the top of Chats with an unread badge, opens it and replies.
  await max.page.goto("/circles");
  const row = max.page.getByRole("link", { name: /Zoe.*are you free Sunday/ });
  await expect(row).toBeVisible();
  await expect(row.getByText("1 unread")).toBeAttached();
  await row.click();
  await expect(max.page.getByText("Just us: are you free Sunday?")).toBeVisible();
  await expect(max.page.getByRole("list", { name: "Tone chosen by the sender" }).getByText("No rush")).toBeVisible();
  await sendMine(max.page, "Yes, Sunday works");
  await expect(zoe.page.getByRole("region", { name: "Max" }).getByText("Yes, Sunday works")).toBeVisible({ timeout: 15_000 });
});
