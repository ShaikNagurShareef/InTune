import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/lib/db/schema";
import { setTestDb, type Db } from "@/lib/db";
import { installMemoryCheckpointer } from "@/lib/graph/checkpointer";
import { setGeminiTransport, type GeminiCredentials, type GenerateRequest } from "@/lib/gemini/client";
import { COMPOSE_SYSTEM, CHECK_SYSTEM, INTERPRET_SYSTEM, SIMPLIFY_SYSTEM } from "@/lib/gemini/prompts";
import { signUp } from "@/lib/services/accounts";
import { createCircle } from "@/lib/services/circles";
import { acceptInvite, createInvite } from "@/lib/services/invites";

export async function freshDb(): Promise<Db> {
  const client = new PGlite();
  const database = drizzle(client, { schema }) as unknown as Db;
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  setTestDb(database);
  installMemoryCheckpointer();
  return database;
}

export const TEST_KEY = "fake-unit-test-key-1234567890abcdef";
export const creds: GeminiCredentials = { apiKey: TEST_KEY, model: "gemini-2.5-flash" };

type Node = "interpret" | "compose" | "check" | "simplify";
const nodeOf = (system: string): Node =>
  system === COMPOSE_SYSTEM ? "compose" : system === CHECK_SYSTEM ? "check" : system === INTERPRET_SYSTEM ? "interpret" : system === SIMPLIFY_SYSTEM ? "simplify" : "compose";

export interface StubCall {
  node: Node;
  input: string;
}

/** Scripted Gemini: each node pops the next queued JSON reply (or uses its default). */
export function stubGemini(queue: Partial<Record<Node, unknown[]>>, defaults: Partial<Record<Node, unknown>> = {}) {
  const calls: StubCall[] = [];
  setGeminiTransport({
    async generate(_c: GeminiCredentials, req: GenerateRequest) {
      const node = nodeOf(req.system);
      calls.push({ node, input: req.parts.map((p) => p.text ?? "[media]").join("\n") });
      const next = queue[node]?.shift() ?? defaults[node];
      if (next === undefined) throw new Error(`no stub reply for ${node}`);
      return typeof next === "string" ? next : JSON.stringify(next);
    },
  });
  return calls;
}

export const composeReply = (draft: string, extra: Record<string, unknown> = {}) => ({
  draft_text: draft,
  evidence_ids: ["source"],
  uncertain_spans: [],
  unresolved_fields: [],
  clarification_question: "",
  choices: [],
  unsupported_additions: [],
  used_phrase_ids: [],
  ...extra,
});

export const checkOk = {
  meaning_preserved: true,
  unsupported_additions: [],
  lost_meaning: [],
  needs_clarification: false,
  question: "",
  choices: [],
};

let counter = 0;
export async function makeUser(name: string) {
  counter += 1;
  const email = `${name.toLowerCase()}${counter}@example.com`;
  const { id } = await signUp({ email, password: "password123", displayName: name });
  return { id, email, displayName: name };
}

/** Owner A with member B in one circle, plus unrelated C. */
export async function circleWithMembers() {
  const a = await makeUser("Ana");
  const b = await makeUser("Ben");
  const c = await makeUser("Cy");
  const { id: circleId } = await createCircle(a.id, "Dinner plans");
  const { token } = await createInvite(a.id, circleId, b.email);
  await acceptInvite(token, b);
  return { a, b, c, circleId };
}
