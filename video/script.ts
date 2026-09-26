import type { Browser, BrowserContext, Page } from "@playwright/test";
import { signedInPage, type DemoUser, type Director } from "./lib/actions";
import { BASE_URL } from "./lib/paths";

/**
 * The demo video, scene by scene. Each beat is one narrated sentence plus what happens on screen while
 * it is spoken. Edit the words here, then run `npm run video` (narration is re-made only for changed lines).
 *
 * Honesty rules: every AI moment is real (never scripted output); demo people are fictional and the app's
 * demo banner stays visible; the one simulated input (Leo's speech in the call) is labelled on screen.
 */

export interface SceneCtx {
  d: Director;
  page: Page;
  browser: Browser;
  /** Other signed-in people acting off camera (e.g. Leo in the call). */
  extras: Record<string, { context: BrowserContext; page: Page }>;
  /** Reveals a card's elements up to this step. */
  card: (step: number) => Promise<void>;
}

export interface Beat {
  say: string;
  run?: (ctx: SceneCtx) => Promise<void>;
  /** A note shown top-right while this beat plays. */
  note?: string;
}

export interface Scene {
  id: string;
  kind: "card" | "app";
  card?: string;
  as?: DemoUser;
  /** Label shown top-left for the whole scene. */
  label?: string;
  /** YouTube chapter that starts with this scene (scenes without one continue the previous chapter). */
  chapter?: string;
  /** Changes demo data (so re-recording is cleaner after a reseed). */
  mutates?: boolean;
  setup?: (ctx: SceneCtx) => Promise<void>;
  teardown?: (ctx: SceneCtx) => Promise<void>;
  beats: Beat[];
}

/** Opens a chat from the list. `name` matches the row's accessible name (avatar initial + title + preview). */
const openChat = async (page: Page, name: RegExp) => {
  await page.goto(`${BASE_URL}/circles`);
  await page.getByRole("link", { name }).last().click();
  await page.waitForURL(/\/circles\/[0-9a-f-]+$/);
  await page.getByRole("list").first().waitFor();
  await page.waitForTimeout(1200);
};

/** Maya's direct chat with Priya (not the family circle, whose preview also mentions Priya). */
const PRIYA_DIRECT = /Priya Chen\s*Are you still OK/;

/** Priya's vague message in the feed (not the list items inside its translation panel). */
const priyaMessage = (page: Page) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: /Translate this message|Hide translation/ }) })
    .filter({ hasText: "bring something small" })
    .last();

const SIMULATED_SPEECH = "Leo’s speech is simulated for this recording · the interpretation is live AI";

export const SCENES: Scene[] = [
  {
    id: "title",
    chapter: "Why InTune",
    kind: "card",
    card: "title",
    beats: [
      { say: "This is InTune: an AI interpreter between people who communicate differently.", run: ({ card }) => card(1) },
      { say: "Say it your way. Be understood. And plan together.", run: ({ card }) => card(2) },
    ],
  },
  {
    id: "story",
    kind: "card",
    card: "story",
    beats: [
      { say: "I grew up with a close friend who found conversations hard.", run: ({ card }) => card(1) },
      { say: "In groups, he struggled to keep up, and I often watched him get lost in the conversation.", run: ({ card }) => card(2) },
      { say: "I always wished I could build something to help him.", run: ({ card }) => card(3) },
      {
        say: "Today, AI makes that possible. So I built InTune, so that nobody has to feel lost in a group, and no friend has to watch it happen.",
        run: ({ card }) => card(4),
      },
    ],
  },
  {
    id: "problem",
    kind: "card",
    card: "problem",
    beats: [
      { say: "He wasn’t alone. Autistic adults are far more likely to feel lonely, and it’s rarely for lack of wanting to connect.", run: ({ card }) => card(1) },
      {
        say: "Research shows where it breaks: when autistic and non-autistic people pass on a story, details get lost, and rapport drops.",
        run: ({ card }) => card(2),
      },
      { say: "It’s called the double empathy problem, because the gap runs both ways.", run: ({ card }) => card(3) },
    ],
  },
  {
    id: "idea",
    kind: "card",
    card: "idea",
    beats: [
      { say: "So InTune doesn’t ask anyone to change how they talk.", run: ({ card }) => card(1) },
      { say: "Instead, AI interprets in both directions, inside small, private circles.", run: ({ card }) => card(2) },
    ],
  },
  {
    id: "home",
    chapter: "Maya’s chats: status and tone tags",
    kind: "app",
    as: "maya",
    label: "Signed in as Maya · autistic",
    setup: async ({ page }) => {
      await page.goto(`${BASE_URL}/circles`);
      await page.getByRole("heading", { name: "Chats", exact: true }).waitFor();
    },
    beats: [
      {
        say: "Meet Maya. These are her chats: circles of friends and family, and one-to-one conversations.",
        run: async ({ d, page }) => {
          await d.point(page.getByRole("link", { name: /Weekend Hangout/ }).last(), 700);
          await d.point(page.getByRole("link", { name: /Board Game Night/ }).last(), 700);
          await d.point(page.getByRole("link", { name: PRIYA_DIRECT }).last(), 700);
        },
      },
      {
        say: "She can share a status, like “replies may be slow”, so nobody has to explain a quiet day.",
        run: async ({ d, page }) => d.point(page.getByRole("button", { name: /Replies may be slow/ }), 1200),
      },
      {
        say: "And messages carry tone tags, like “just asking” or “no rush”, so meaning isn’t left to guesswork.",
        run: async ({ d, page }) => {
          await d.click(page.getByRole("link", { name: /Board Game Night/ }).last(), 1500);
          await d.point(page.getByRole("list", { name: "Tone chosen by the sender" }).first(), 1200);
        },
      },
    ],
  },
  {
    id: "translate-in",
    chapter: "Understanding what others mean",
    kind: "app",
    as: "maya",
    label: "Maya · a message from her sister",
    setup: async ({ page }) => {
      // Maya translates incoming messages automatically. Open the chat once off camera so every
      // translation is ready (and real); on camera the chat then opens settled on Priya's message.
      await openChat(page, PRIYA_DIRECT);
      await priyaMessage(page).getByText("What they’re asking").waitFor({ timeout: 60_000 });
      await page.waitForTimeout(4000);
      await page.goto(`${BASE_URL}/circles`);
      await page.getByRole("link", { name: PRIYA_DIRECT }).last().waitFor();
    },
    beats: [
      {
        say: "Here’s a message from Maya’s sister: “It’d be nice if you could maybe bring something small?”",
        run: async ({ d, page }) => {
          await d.click(page.getByRole("link", { name: PRIYA_DIRECT }).last(), 900);
          await d.point(page.getByText("It'd be nice if you could maybe bring something small?").last(), 900);
        },
      },
      {
        say: "Is that a question? Does she need to reply? Maya has translation switched on, so InTune explains it right underneath.",
        run: async ({ d, page }) => {
          const item = priyaMessage(page);
          // Opens by itself for Maya; if it hasn't yet, she taps Translate.
          await d.ai(
            "translate-in",
            async () => {
              await d.pause(1500);
              const open = item.getByRole("button", { name: "Translate this message" });
              if (!(await item.getByText("What they’re asking").isVisible()) && (await open.isVisible())) await d.click(open, 200);
            },
            item.getByText("What they’re asking"),
          );
        },
      },
      {
        say: "In plain words, it shows what’s being asked, that a reply is expected, and what’s still unclear.",
        run: async ({ d, page }) => {
          const item = priyaMessage(page);
          await d.point(item.getByText("What they’re asking"), 900);
          await d.point(item.getByText("Reply needed?"), 900);
          await d.point(item.getByText("What’s unclear"), 900);
        },
      },
      {
        say: "Only Maya sees this, and her sister’s words never change.",
        run: async ({ d, page }) => d.point(page.getByText("only you see this").last(), 1200),
      },
    ],
  },
  {
    id: "translate-out",
    chapter: "Being understood, with approval",
    kind: "app",
    as: "leo",
    label: "Signed in as Leo · autistic",
    mutates: true,
    setup: async ({ page }) => openChat(page, /Board Game Night/),
    beats: [
      {
        say: "Now the other direction. Leo is autistic too, and when talking is hard, he writes in shorthand.",
        run: async ({ d, page }) => d.type(page.getByLabel("Your message"), "sat ok. no loud music pls. leave 8 maybe"),
      },
      {
        say: "He taps Translate, and InTune turns it into clear words that keep his meaning.",
        run: async ({ d, page }) =>
          d.ai(
            "translate-out",
            () => d.click(page.getByRole("button", { name: "Translate", exact: true }), 200),
            page.getByRole("heading", { name: /Check the translation/ }),
          ),
      },
      {
        say: "Leo sees exactly what his friends will read, and who will read it.",
        run: async ({ d, page }) => {
          await d.point(page.getByText("They’ll see exactly this"), 1000);
          await d.point(page.getByText(/^To Board Game Night/), 1000);
        },
      },
      {
        say: "He adds a tone, “not upset”, and approves it. The AI can never send anything by itself.",
        run: async ({ d, page }) => {
          await d.click(page.getByRole("button", { name: "Not upset" }).last(), 600);
          const ack = page.getByRole("checkbox", { name: /I’ve checked it/ });
          if (await ack.isVisible()) await d.click(ack, 400);
          await d.click(page.getByRole("button", { name: "Approve and send" }), 400);
          await page.getByRole("status").filter({ hasText: "Sent." }).waitFor({ timeout: 20_000 });
        },
      },
      {
        say: "It’s labelled as AI-assisted and approved by Leo, and a built-in check flags any “not”, time or name that goes missing.",
        run: async ({ d, page }) => d.point(page.getByText("AI-assisted · you approved").last(), 1500),
      },
    ],
  },
  {
    id: "profile",
    chapter: "How to talk with me",
    kind: "app",
    as: "maya",
    label: "Maya’s profile",
    setup: async ({ page }) => {
      await page.goto(`${BASE_URL}/me`);
      await page.getByRole("heading", { name: "How to talk with me" }).waitFor();
    },
    beats: [
      {
        say: "People can share how they like to be spoken to, on a “How to talk with me” card that their circles can see.",
        run: async ({ d, page }) => {
          await d.point(page.getByRole("heading", { name: "How to talk with me" }), 700);
          await d.point(page.getByRole("button", { name: "Ask me direct questions" }), 700);
          await d.point(page.getByRole("button", { name: "Give me time to reply" }), 700);
        },
      },
      {
        say: "They keep a phrasebook of their own expressions, like “loud box”, meaning “it’s too noisy here”.",
        run: async ({ d, page }) => {
          await d.scrollBy(520, 800);
          await d.point(page.getByText("“loud box”"), 1200);
        },
      },
      {
        say: "And they can choose calm colours that are easy on the senses.",
        run: async ({ d, page }) => {
          await d.scrollBy(420, 700);
          await d.click(page.getByText("Soft dark", { exact: true }), 1500);
          await d.click(page.getByText("Calm", { exact: true }), 900);
        },
      },
    ],
  },
  {
    id: "plan",
    chapter: "Plan it together",
    kind: "app",
    as: "priya",
    label: "Signed in as Priya · Maya’s sister",
    mutates: true,
    setup: async ({ page }) => openChat(page, /Weekend Hangout/),
    beats: [
      {
        say: "Group chats are where people get lost. Here, Maya’s friends are trying to plan a weekend.",
        run: async ({ d, page }) => {
          await page.mouse.move(900, 350);
          await d.scrollBy(-500, 1200);
        },
      },
      {
        say: "Sunday, not Saturday. Somewhere quiet. Mornings are better. And Jordan needs an exact start and end time.",
        run: async ({ d }) => {
          await d.scrollBy(250, 1400);
          await d.scrollBy(400, 1200);
        },
      },
      {
        say: "Priya taps “Plan it together”.",
        run: async ({ d, page }) => {
          await d.click(page.getByRole("button", { name: "Plan it together" }), 700);
          await d.type(page.getByRole("dialog").getByLabel("What are we planning? (optional)"), "our Sunday meetup");
        },
      },
      {
        say: "InTune reads the chat, and what each person shared about how they communicate, and drafts one plan that everyone can enjoy.",
        run: async ({ d, page }) => {
          const sheet = page.getByRole("dialog", { name: "Plan it together" });
          await d.ai("plan", () => d.click(sheet.getByRole("button", { name: "Draft a plan" }), 200), sheet.getByTestId("plan-card"), sheet.getByRole("alert"));
        },
      },
      {
        say: "It shows how the plan works for each person, like a quiet place for Maya and a morning start for Leo.",
        run: async ({ d, page }) => d.point(page.getByText("So it works for everyone"), 2000),
      },
      {
        say: "Anything still open becomes a simple, direct question.",
        run: async ({ d, page }) => d.point(page.getByText("Still to decide"), 1500),
      },
      {
        say: "Priya checks the exact text, and posts it to the group.",
        run: async ({ d, page }) => {
          const sheet = page.getByRole("dialog", { name: "Plan it together" });
          await d.click(sheet.getByRole("button", { name: "Review and post" }), 1200);
          await d.click(sheet.getByRole("button", { name: "Approve and post" }), 400);
          await sheet.waitFor({ state: "hidden", timeout: 20_000 });
          await page.waitForTimeout(1200);
        },
      },
    ],
  },
  {
    id: "call",
    chapter: "Live calls with an AI interpreter",
    kind: "app",
    as: "maya",
    label: "Maya · live call with Leo",
    setup: async ({ page, browser, extras }) => {
      await openChat(page, /Board Game Night/);
      extras.leo = await signedInPage(browser, "leo", { fakeSpeech: true });
      await openChat(extras.leo.page, /Board Game Night/);
    },
    teardown: async ({ extras }) => extras.leo?.context.close(),
    beats: [
      {
        say: "Calls can be the hardest part, so InTune brings a calm, live interpreter into the call.",
        run: async ({ d, page }) => {
          await d.click(page.getByRole("link", { name: "Start an audio call" }), 1500);
          await d.point(page.getByText("Help during the call"), 900);
          await d.click(page.getByRole("button", { name: "Start the call" }), 500);
          await page.getByRole("list", { name: "People in the call" }).getByRole("listitem").first().waitFor({ timeout: 30_000 });
        },
      },
      {
        say: "Leo joins. The screen stays steady: nothing jumps around, and a soft ring shows who’s talking.",
        run: async ({ d, page, extras }) => {
          const leo = extras.leo.page;
          await d.ai(
            "wait-join",
            async () => {
              await leo.reload();
              await leo.getByRole("status").filter({ hasText: "Call in progress" }).getByRole("link", { name: "Join" }).click({ timeout: 30_000 });
              await leo.getByRole("button", { name: "Join the call" }).click({ timeout: 30_000 });
            },
            page.getByRole("list", { name: "People in the call" }).getByRole("listitem").nth(1),
          );
          await d.point(page.getByRole("list", { name: "People in the call" }).getByRole("listitem").filter({ hasText: "Leo" }), 900);
        },
      },
      {
        say: "When Leo speaks, everyone gets captions, and Maya’s private interpreter explains each line in plain words.",
        note: SIMULATED_SPEECH,
        run: async ({ d, page, extras }) => {
          const leo = extras.leo.page;
          const line = "Honestly it's whatever, but maybe we could start the long game at seven, if that's okay?";
          await d.ai("interpret", () => leo.evaluate((t) => (window as unknown as { __say: (s: string) => Promise<boolean> }).__say(t), line).then(() => undefined), page.getByText("In plain words").last());
          await d.point(page.getByText("In plain words").last(), 1200);
        },
      },
      {
        say: "If Leo needs a moment, one tap sends a signal, without interrupting anyone.",
        run: async ({ d, page, extras }) => {
          const leo = extras.leo.page;
          await leo.getByRole("button", { name: "Send a signal" }).click();
          await leo.getByRole("group", { name: "Signals" }).getByRole("button", { name: "Please slow down" }).click();
          const chip = page.getByRole("list", { name: "People in the call" }).getByRole("listitem").filter({ hasText: "Leo" }).getByText("Please slow down");
          await chip.waitFor({ timeout: 15_000 });
          await d.point(chip, 1200);
        },
      },
      {
        say: "And when speaking is hard, he can type instead. InTune suggests clear words, he approves them, and everyone hears them read aloud.",
        run: async ({ d, page, extras }) => {
          const leo = extras.leo.page;
          await leo.getByRole("button", { name: "Type and say it for me" }).click();
          await leo.getByLabel("Type what you want to say").fill("need break back 5");
          await d.ai("say", () => leo.getByRole("button", { name: "Make it clear" }).click(), leo.getByTestId("say-suggestion"), leo.getByRole("alert").filter({ hasText: /suggestion|busy|Couldn/ }));
          await leo.getByTestId("say-suggestion").getByRole("button", { name: "Say this" }).click();
          const typed = page.getByRole("list", { name: "What was said" }).getByText("Leo Park · typed").last();
          await typed.waitFor({ timeout: 15_000 });
          await d.point(typed, 1500);
        },
      },
      {
        say: "When the call ends, nothing from it is kept.",
        run: async ({ d, page }) => {
          await d.click(page.getByRole("button", { name: "More options" }), 600);
          await d.click(page.getByRole("button", { name: /End call for everyone/ }), 500);
          await d.click(page.getByRole("button", { name: "End for all" }), 500);
          await page.getByRole("heading", { name: "You ended the call for everyone" }).waitFor({ timeout: 15_000 });
          await d.point(page.getByText("Captions and interpreter notes from the call were not saved."), 1200);
        },
      },
    ],
  },
  {
    id: "trust",
    chapter: "Trust by design",
    kind: "card",
    card: "trust",
    beats: [
      {
        say: "Throughout, AI helps, and people decide. It never sends for you, never quietly drops a fact, and never guesses anyone’s feelings.",
        run: ({ card }) => card(1),
      },
      {
        say: "And if the AI is down, everyone can still talk: messages, phrases, calls, blocking and reporting all work without it.",
        run: ({ card }) => card(2),
      },
    ],
  },
  {
    id: "outro",
    kind: "card",
    card: "outro",
    beats: [
      { say: "InTune brings people closer, without asking anyone to become someone else.", run: ({ card }) => card(1) },
      { say: "It’s live today. Try it with the demo accounts, and read the code on GitHub.", run: ({ card }) => card(2) },
    ],
  },
];

export const sceneById = (id: string): Scene => {
  const scene = SCENES.find((s) => s.id === id);
  if (!scene) throw new Error(`Unknown scene "${id}". Scenes: ${SCENES.map((s) => s.id).join(", ")}`);
  return scene;
};
