import { expect, test, type Page } from "@playwright/test";
import { addKey, createCircle, inviteAndJoin, signUp } from "./helpers";

// Needs the local LiveKit dev server: `livekit-server --dev` (ws://localhost:7880).

const people = (page: Page) => page.getByRole("list", { name: "People in the call" }).getByRole("listitem");

test("group call: join from the chat, signals, and say-it-for-me with approval", async ({ browser }) => {
  const ivy = await signUp(browser, "Ivy");
  const ray = await signUp(browser, "Ray");
  await createCircle(ivy.page, "Game night");
  await inviteAndJoin(ivy.page, ray.page, ray.email);
  const circleUrl = ray.page.url();

  // Ivy starts a video call; the pre-join screen shows her camera preview and the help options.
  await ivy.page.goto(circleUrl);
  await ivy.page.getByRole("link", { name: "Start a video call" }).click();
  await expect(ivy.page.getByRole("heading", { name: /Video call · Game night/ })).toBeVisible();
  await expect(ivy.page.getByText("Nobody is in the call yet. You can start it.")).toBeVisible();
  await ivy.page.getByRole("button", { name: "Start the call" }).click();
  await expect(people(ivy.page)).toHaveCount(1);
  await expect(ivy.page.getByText("Waiting for others to join…")).toBeVisible();

  // Ray sees the call in the chat and joins it.
  await addKey(ray.page);
  await ray.page.goto(circleUrl);
  const banner = ray.page.getByRole("status").filter({ hasText: "Call in progress" });
  await expect(banner).toContainText("Ivy", { timeout: 15_000 });
  await banner.getByRole("link", { name: "Join" }).click();
  await expect(ray.page.getByText(/In the call now: Ivy/)).toBeVisible();
  await ray.page.getByRole("button", { name: "Join the call" }).click();
  await expect(people(ray.page)).toHaveCount(2);
  await expect(people(ivy.page)).toHaveCount(2);

  // Muting really stops the microphone: the other person sees it.
  await ray.page.getByRole("button", { name: "Mute microphone" }).click();
  await expect(people(ivy.page).filter({ hasText: "Ray" })).toHaveAttribute("aria-label", /muted/);
  await ray.page.getByRole("button", { name: "Unmute microphone" }).click();
  await expect(people(ivy.page).filter({ hasText: "Ray" })).not.toHaveAttribute("aria-label", /muted/);

  // A one-tap signal reaches the other person.
  await ivy.page.getByRole("button", { name: "Send a signal" }).click();
  await ivy.page.getByRole("group", { name: "Signals" }).getByRole("button", { name: "Please slow down" }).click();
  await expect(people(ray.page).filter({ hasText: "Ivy" }).getByText("Please slow down")).toBeVisible();

  // Ray types shorthand, asks for clearer wording, approves it, and Ivy receives exactly that text.
  await ray.page.getByRole("button", { name: "Type and say it for me" }).click();
  await ray.page.getByLabel("Type what you want to say").fill("need break back 5");
  await ray.page.getByRole("button", { name: "Make it clear" }).click();
  const suggestion = ray.page.getByTestId("say-suggestion");
  await expect(suggestion).toContainText("I need a short break. I will be back in five minutes.");
  await suggestion.getByRole("button", { name: "Say this" }).click();
  const ivyTranscript = ivy.page.getByRole("list", { name: "What was said" });
  await expect(ivyTranscript.getByText("I need a short break. I will be back in five minutes.")).toBeVisible();
  await expect(ivyTranscript.getByText("Ray · typed")).toBeVisible();

  // Ray leaves calmly; Ivy (who started it) then ends the call for everyone.
  await ray.page.getByRole("button", { name: "Leave the call" }).click();
  await expect(ray.page.getByRole("heading", { name: "You left the call" })).toBeVisible();
  await expect(ray.page.getByText("Captions and interpreter notes from the call were not saved.")).toBeVisible();
  await expect(people(ivy.page)).toHaveCount(1);
  await ray.page.getByRole("button", { name: "Join again" }).click();
  await ray.page.getByRole("button", { name: "Join the call" }).click();
  await expect(people(ivy.page)).toHaveCount(2);
  await ivy.page.getByRole("button", { name: "More options" }).click();
  await ivy.page.getByRole("button", { name: /End call for everyone/ }).click();
  await ivy.page.getByRole("button", { name: "End for all" }).click();
  // First use of the end-call route compiles it in dev, so allow extra time.
  await expect(ivy.page.getByRole("heading", { name: "You ended the call for everyone" })).toBeVisible({ timeout: 45_000 });
  await expect(ray.page.getByRole("heading", { name: "The call ended" })).toBeVisible();
});
