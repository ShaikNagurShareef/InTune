/**
 * Seeds scripted demo conversations (fictional adults, non-sensitive content) for judges and rehearsals.
 *
 *   npm run seed:demo            # (re)creates all demo accounts and conversations
 *
 * Everything is created through the app's own services, so it follows the same rules as real use.
 * Seeded messages are never marked AI-assisted: scripted text must not be presented as AI output (spec §15).
 * All demo accounts use the reserved @intune.demo domain and share DEMO_PASSWORD.
 */
import "dotenv/config";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { circles, memberships, messages, preferences, users } from "../src/lib/db/schema";
import { setCommCard, setStatus, signUp } from "../src/lib/services/accounts";
import { createCircle } from "../src/lib/services/circles";
import { openDirect } from "../src/lib/services/direct";
import { acceptInvitation, inviteByEmail, listMyInvitations } from "../src/lib/services/invites";
import { createPhrase } from "../src/lib/services/phrasebook";
import { publishMessage } from "../src/lib/services/publish";
import type { CommCard, StatusId, ToneTagId } from "../src/lib/social";

export const DEMO_PASSWORD = "InTune-demo-2026";

interface Persona {
  key: string;
  name: string;
  status: StatusId;
  card: CommCard | null;
  phrases: { phrase: string; meaning: string }[];
}

const PEOPLE: Persona[] = [
  {
    key: "maya",
    name: "Maya Chen",
    status: "slow_replies",
    card: {
      chips: ["I prefer text", "Ask me direct questions", "Give me time to reply"],
      note: "If I go quiet, I'm recharging — not upset.",
    },
    phrases: [
      { phrase: "tea time", meaning: "I need a short break." },
      { phrase: "loud box", meaning: "It's too noisy here. Can we move somewhere quieter?" },
    ],
  },
  {
    key: "leo",
    name: "Leo Park",
    status: "low_energy",
    card: {
      chips: ["One question at a time", "Please say what you mean literally", "I may not reply right away — that's OK"],
      note: "When talking is hard I use phrases. “Red light” means I need to stop for now.",
    },
    phrases: [
      { phrase: "red light", meaning: "I'm overwhelmed and need to stop for now." },
      { phrase: "green light", meaning: "I'm OK to continue." },
    ],
  },
  {
    key: "jordan",
    name: "Jordan Ellis",
    status: "none",
    card: { chips: ["Please avoid sarcasm", "Ask me direct questions"], note: "I like plans with a start time, a place and an end time." },
    phrases: [],
  },
  {
    key: "priya",
    name: "Priya Chen",
    status: "none",
    card: { chips: [], note: "Happy to call or text — just tell me which you prefer." },
    phrases: [],
  },
  { key: "grace", name: "Grace Chen", status: "none", card: null, phrases: [] },
  { key: "sam", name: "Sam Rivera", status: "none", card: null, phrases: [] },
  { key: "ava", name: "Ava Thompson", status: "none", card: null, phrases: [] },
  { key: "guest", name: "Demo Guest", status: "none", card: null, phrases: [] },
];

const email = (key: string) => `${key}@intune.demo`;
type Ids = Record<string, { id: string; email: string }>;

/** Removes every demo account and anything they own (circles cascade to memberships, messages, invites). */
async function reset(): Promise<void> {
  const demo = await db().select({ id: users.id }).from(users).where(like(users.email, "%@intune.demo"));
  if (!demo.length) return;
  const ids = demo.map((u) => u.id);
  await db().delete(circles).where(inArray(circles.ownerId, ids));
  await db().delete(users).where(inArray(users.id, ids));
}

async function createPeople(): Promise<Ids> {
  const ids: Ids = {};
  for (const p of PEOPLE) {
    const { id } = await signUp({ email: email(p.key), password: DEMO_PASSWORD, displayName: p.name });
    ids[p.key] = { id, email: email(p.key) };
    await setStatus(id, p.status);
    if (p.card) await setCommCard(id, p.card);
    for (const ph of p.phrases) await createPhrase(id, { ...ph, example: null });
  }
  return ids;
}

async function circleWith(ids: Ids, owner: string, name: string, members: string[]): Promise<string> {
  const { id } = await createCircle(ids[owner].id, name);
  for (const m of members) {
    await inviteByEmail(ids[owner].id, id, ids[m].email);
    const [inv] = (await listMyInvitations(ids[m])).filter((i) => i.circleId === id);
    await acceptInvitation(inv.id, ids[m]);
  }
  return id;
}

let counter = 0;
interface Line {
  from: string;
  text: string;
  tones?: ToneTagId[];
  /** Minutes before now. */
  ago: number;
}

async function post(ids: Ids, circleId: string, lines: Line[]): Promise<void> {
  for (const line of lines) {
    counter += 1;
    const { messageId } = await publishMessage(ids[line.from].id, {
      circleId,
      text: line.text,
      replyToId: null,
      idempotencyKey: `demo-seed-${counter.toString().padStart(4, "0")}`,
      draftId: null,
      approvalId: null,
      toneTags: line.tones ?? [],
    });
    await db()
      .update(messages)
      .set({ createdAt: new Date(Date.now() - line.ago * 60_000) })
      .where(eq(messages.id, messageId));
  }
  // Members joined before the conversation started, so everyone can see the whole history.
  await db()
    .update(memberships)
    .set({ joinedAt: new Date(Date.now() - 10 * 24 * 60 * 60_000) })
    .where(eq(memberships.circleId, circleId));
}

const H = 60;
const D = 24 * H;

async function seed(): Promise<void> {
  await reset();
  const ids = await createPeople();

  // Autistic ↔ autistic: a literal, low-pressure plan with explicit tone and sensory needs.
  const games = await circleWith(ids, "jordan", "Board Game Night 🎲", ["maya", "leo"]);
  await post(ids, games, [
    { from: "jordan", ago: 3 * D, text: "Board game night is on Saturday.\nTime: 6:00 pm to 9:00 pm.\nPlace: my flat, 14 Elm Street, 2nd floor.\nGame: Catan. You do not need to bring anything." },
    { from: "jordan", ago: 3 * D - 1, text: "Can you reply yes or no by Friday?", tones: ["just_asking", "no_rush"] },
    { from: "maya", ago: 3 * D - 40, text: "Yes. I will come." },
    { from: "maya", ago: 3 * D - 41, text: "Can we keep the lights dim? Bright ceiling lights are hard for me.", tones: ["just_asking"] },
    { from: "jordan", ago: 3 * D - 55, text: "Yes. I will use the lamps, not the ceiling light.", tones: ["serious"] },
    { from: "leo", ago: 2 * D, text: "green light" },
    { from: "leo", ago: 2 * D - 1, text: "Yes. I might leave at 8:00 pm.", tones: ["no_reply_needed"] },
    { from: "jordan", ago: 2 * D - 30, text: "That is fine. Leaving early is always OK here.", tones: ["not_upset"] },
    { from: "maya", ago: 5 * H, text: "Thank you for tonight. I liked the quiet room.", tones: ["serious"] },
  ]);

  // Autistic ↔ non-autistic family: indirect wording gets made concrete; the family learns tone tags.
  const family = await circleWith(ids, "priya", "Chen Family 🏡", ["maya", "grace"]);
  await post(ids, family, [
    { from: "grace", ago: 2 * D + 3 * H, text: "We should probably do something for Dad's birthday at some point, maybe?" },
    { from: "maya", ago: 2 * D + 2 * H, text: "Can you say that more directly?", tones: ["not_upset", "just_asking"] },
    { from: "priya", ago: 2 * D + 2 * H - 20, text: "Sorry! Clearer version: Dad's birthday is Sunday 12 October. Can you come to lunch at 1:00 pm at Mom's house?", tones: ["just_asking", "no_rush"] },
    { from: "maya", ago: 2 * D + H, text: "Yes. I can come. I will leave by 3:00 pm." },
    { from: "grace", ago: 2 * D + H - 10, text: "Lovely, see you then 😊", tones: ["not_upset"] },
    { from: "priya", ago: 2 * D + H - 12, text: "Mom means she's happy with that plan. No reply needed!", tones: ["no_reply_needed"] },
  ]);

  // Autistic ↔ non-autistic at work: vague request → explicit deadline.
  const studio = await circleWith(ids, "sam", "Studio Team 💼", ["leo", "ava"]);
  await post(ids, studio, [
    { from: "sam", ago: D + 4 * H, text: "Hey team, no worries if not, but it'd be amazing if the client deck could maybe be ready-ish by Thursday? 🙏" },
    { from: "leo", ago: D + 3 * H, text: "Just to check: do you need the full deck finished on Thursday? What time?", tones: ["just_asking", "not_upset"] },
    { from: "sam", ago: D + 3 * H - 15, text: "Yes, the full deck. Thursday at 3:00 pm. Thanks for asking!", tones: ["not_upset"] },
    { from: "leo", ago: D + 2 * H, text: "OK. I will send it on Thursday by 3:00 pm." },
    { from: "ava", ago: 3 * H, text: "Great teamwork. Reminder: the Friday stand-up is optional this week.", tones: ["no_reply_needed"] },
  ]);

  // Direct chats.
  const mayaLeo = (await openDirect(ids.maya.id, ids.leo.id)).id;
  await post(ids, mayaLeo, [
    { from: "leo", ago: D + 6 * H, text: "red light" },
    { from: "maya", ago: D + 6 * H - 5, text: "OK. You don't need to reply. I'm here later.", tones: ["no_reply_needed", "not_upset"] },
    { from: "leo", ago: D, text: "green light. Thank you for waiting." },
    { from: "maya", ago: D - 20, text: "Of course. Do you want to sit together on Saturday? Yes or no is fine.", tones: ["just_asking", "no_rush"] },
    { from: "leo", ago: 40, text: "Yes. Next to the window, please." },
  ]);

  const mayaPriya = (await openDirect(ids.priya.id, ids.maya.id)).id;
  await post(ids, mayaPriya, [
    { from: "priya", ago: 4 * D, text: "Hey! Random thought — would you be up for a call sometime this week?" },
    { from: "maya", ago: 4 * D - 60, text: "I prefer text. Can we text instead?", tones: ["not_upset"] },
    { from: "priya", ago: 4 * D - 70, text: "Of course, text is great. I'll stop asking about calls 💛", tones: ["not_upset"] },
    { from: "maya", ago: 4 * D - 90, text: "Thank you. That helps a lot." },
    { from: "priya", ago: 2 * H, text: "Are you still OK for lunch on Sunday? It'd be nice if you could maybe bring something small?" },
  ]);

  const leoSam = (await openDirect(ids.sam.id, ids.leo.id)).id;
  await post(ids, leoSam, [
    { from: "sam", ago: 2 * D + 5 * H, text: "Quick one — any chance you could take a look at my slides at some point?" },
    { from: "leo", ago: 2 * D + 4 * H, text: "Which slides, and by when?", tones: ["just_asking"] },
    { from: "sam", ago: 2 * D + 4 * H - 10, text: "The pricing slides (8 to 12). By Wednesday at noon. No rush before then.", tones: ["no_rush"] },
    { from: "leo", ago: 2 * D + 3 * H, text: "OK. I will review slides 8 to 12 by Wednesday at 12:00 pm." },
  ]);

  // Everyone has read everything except the newest messages, so unread badges look natural.
  const demoIds = Object.values(ids).map((u) => u.id);
  await db()
    .update(memberships)
    .set({ lastReadAt: new Date(Date.now() - 6 * H * 60_000) })
    .where(inArray(memberships.userId, demoIds));
  await db()
    .update(memberships)
    .set({ lastReadAt: sql`now()` })
    .where(and(inArray(memberships.userId, [ids.jordan.id, ids.sam.id, ids.grace.id, ids.ava.id])));

  // Maya and Leo have opted in to automatic translation of messages they receive.
  await db()
    .update(preferences)
    .set({ autoTranslate: true })
    .where(inArray(preferences.userId, [ids.maya.id, ids.leo.id]));

  // The guest account has one invitation waiting in Requests.
  await inviteByEmail(ids.jordan.id, games, ids.guest.email);

  const count = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(inArray(messages.senderId, demoIds));
  process.stdout.write(
    `Seeded ${PEOPLE.length} demo accounts, 6 conversations, ${count[0].n} demo messages.\n` +
      `Sign in with any of: ${PEOPLE.map((p) => email(p.key)).join(", ")}\nPassword: ${DEMO_PASSWORD}\n`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    process.stderr.write(`Seeding failed: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
