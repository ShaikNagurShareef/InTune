/**
 * InTune evaluation harness (spec §12–13): B0 / B1 / B2 on InTune's own labeled fixtures.
 *
 *   GEMINI_API_KEY=... npm run eval -- --baseline B2 --split dev [--model gemini-2.5-flash] [--limit 10]
 *
 * The key is read from the shell environment of the person running the eval; the web app never reads it.
 * Results are written to eval/reports/ and merged into eval/reports/latest.json for the /benchmarks page.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Command, MemorySaver } from "@langchain/langgraph";
import { generateJson, type GeminiCredentials } from "../src/lib/gemini/client";
import { DEFAULT_MODEL, PROMPT_VERSION } from "../src/lib/gemini/config";
import { COMPOSE_SYSTEM, SIMPLIFY_SYSTEM, composeOutput, simplifyOutput } from "../src/lib/gemini/prompts";
import { buildAssistGraph, type AssistInterrupt, type AssistStateType } from "../src/lib/graph/assist-graph";
import { diffSlots, extractSlots } from "../src/lib/meaning/critical-slots";

type Baseline = "B0" | "B1" | "B2";
type Split = "dev" | "heldout";

interface Fixture {
  id: string;
  family: string;
  split: Split;
  source: string;
  mode: "keep" | "clearer" | "shorter" | "simplify";
  expect: {
    clarify: boolean;
    keep: string[];
    forbid: string[];
    answer: string | null;
    phrases: { id: string; phrase: string; meaning: string }[];
  };
}

interface CaseResult {
  id: string;
  family: string;
  asked: boolean;
  drafted: boolean;
  draft: string;
  keepOk: boolean;
  missingKeep: string[];
  forbiddenHit: string[];
  negationOk: boolean | null;
  inventedSlots: string[];
  modelFlags: number;
  latencyMs: number;
  error: string | null;
}

const ROOT = path.resolve(import.meta.dirname);
const FIXTURES = path.join(ROOT, "fixtures", "custom.jsonl");

function args() {
  const a = process.argv.slice(2);
  const get = (name: string) => {
    const i = a.indexOf(`--${name}`);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    baseline: (get("baseline") ?? "B2") as Baseline,
    split: (get("split") ?? "dev") as Split,
    model: get("model") ?? DEFAULT_MODEL,
    limit: get("limit") ? Number(get("limit")) : Infinity,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ");
const hasNegation = (s: string) => extractSlots(s).some((x) => x.kind === "negation");
const NEGATION_TOKENS = new Set(["not", "no", "never", "cant", "dont", "wont", "cannot", "no one", "nothing"]);

function keepSatisfied(token: string, draft: string): boolean {
  const t = norm(token);
  if (norm(draft).includes(t)) return true;
  if (NEGATION_TOKENS.has(t)) return hasNegation(draft);
  return false;
}

function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}

async function runB1(f: Fixture, creds: GeminiCredentials) {
  if (f.mode === "simplify") return runSimplify(f, creds);
  const input = {
    mode: f.mode,
    sentence_length: "medium",
    force_draft: false,
    source: { id: "source", text: f.source, uncertain: [] },
    phrases: [],
    answers: [],
  };
  const { data } = await generateJson(creds, { system: COMPOSE_SYSTEM, parts: [{ text: JSON.stringify(input) }] }, composeOutput);
  return { asked: data.clarification_question.trim().length > 0, draft: data.draft_text, flags: data.unsupported_additions.length, evidence: f.source };
}

async function runSimplify(f: Fixture, creds: GeminiCredentials) {
  const { data } = await generateJson(creds, { system: SIMPLIFY_SYSTEM, parts: [{ text: JSON.stringify({ message: f.source }) }] }, simplifyOutput);
  return { asked: false, draft: data.simplified_text, flags: 0, evidence: f.source };
}

/** B2 = the production LangGraph workflow, with clarification answered from the fixture's scripted answer. */
async function runB2(f: Fixture, creds: GeminiCredentials) {
  if (f.mode === "simplify") return runSimplify(f, creds);
  const graph = buildAssistGraph(
    {
      creds,
      mediaPart: async () => {
        throw new Error("no media in text fixtures");
      },
      findPhrases: async (_owner, text) =>
        f.expect.phrases
          .filter((p) => norm(text).includes(norm(p.phrase)))
          .map((p) => ({ id: p.id, revision: 1, phrase: p.phrase, meaning: p.meaning })),
      onStage: async () => undefined,
      onModelCall: () => undefined,
    },
    new MemorySaver(),
  );
  const config = { configurable: { thread_id: `${f.id}-${Date.now()}` } };
  await graph.invoke(
    { ownerId: "eval", draftId: f.id, sourceMode: "type", sourceText: f.source, mediaId: null, wordingMode: f.mode, sentenceLength: "medium" },
    config,
  );
  let asked = false;
  for (let round = 0; round < 3; round++) {
    const snap = await graph.getState(config);
    const pending = snap.tasks.flatMap((t) => t.interrupts ?? [])[0]?.value as AssistInterrupt | undefined;
    if (!pending || pending.kind !== "clarify") break;
    asked = true;
    await graph.invoke(new Command({ resume: { answer: f.expect.answer ?? "I'm not sure" } }), config);
  }
  const state = (await graph.getState(config)).values as AssistStateType;
  const flags = (state.flags?.unsupportedAdditions.length ?? 0) + (state.flags?.lostMeaning.length ?? 0);
  const evidence = [f.source, ...state.answers.map((a) => a.answer)].join("\n");
  return { asked, draft: state.composed?.draft_text ?? "", flags, evidence };
}

async function evaluate(f: Fixture, baseline: Baseline, creds: GeminiCredentials): Promise<CaseResult> {
  const started = Date.now();
  try {
    const out =
      baseline === "B0"
        ? { asked: false, draft: f.source, flags: 0, evidence: f.source }
        : baseline === "B1"
          ? await runB1(f, creds)
          : await runB2(f, creds);
    const draft = out.draft.replace(/\[[^\]]*\?\]/g, "").trim();
    const missingKeep = f.expect.keep.filter((k) => !keepSatisfied(k, draft) && !(out.asked && baseline !== "B2"));
    const forbiddenHit = f.expect.forbid.filter((x) => norm(draft).includes(norm(x)));
    const srcNeg = hasNegation(out.evidence);
    return {
      id: f.id,
      family: f.family,
      asked: out.asked,
      drafted: draft.length > 0,
      draft,
      keepOk: missingKeep.length === 0,
      missingKeep,
      forbiddenHit,
      negationOk: srcNeg ? hasNegation(draft) || (out.asked && baseline === "B1") : null,
      inventedSlots: diffSlots(out.evidence, draft).added.filter((s) => s.kind !== "name").map((s) => s.value),
      modelFlags: out.flags,
      latencyMs: Date.now() - started,
      error: null,
    };
  } catch (err) {
    return {
      id: f.id, family: f.family, asked: false, drafted: false, draft: "", keepOk: false, missingKeep: f.expect.keep,
      forbiddenHit: [], negationOk: null, inventedSlots: [], modelFlags: 0, latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function ratio(hit: number, total: number) {
  return { hit, total, rate: total ? Math.round((hit / total) * 1000) / 1000 : null };
}

function summarize(fixtures: Fixture[], results: CaseResult[]) {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const clarifyCases = results.filter((r) => byId.get(r.id)?.expect.clarify);
  const clearCases = results.filter((r) => !byId.get(r.id)?.expect.clarify && r.family !== "simplify");
  const negCases = results.filter((r) => r.negationOk !== null);
  const latencies = results.filter((r) => !r.error).map((r) => r.latencyMs);
  return {
    cases: results.length,
    errors: results.filter((r) => r.error).length,
    critical_keep: ratio(results.filter((r) => r.keepOk).length, results.length),
    negation_preserved_or_queried: ratio(negCases.filter((r) => r.negationOk).length, negCases.length),
    clarification_recall: ratio(clarifyCases.filter((r) => r.asked).length, clarifyCases.length),
    unnecessary_clarification: ratio(clearCases.filter((r) => r.asked).length, clearCases.length),
    clear_input_coverage: ratio(clearCases.filter((r) => r.drafted && !r.asked).length, clearCases.length),
    forbidden_content: ratio(results.filter((r) => r.forbiddenHit.length).length, results.length),
    invented_slots: ratio(results.filter((r) => r.inventedSlots.length).length, results.length),
    by_family: Object.fromEntries(
      [...new Set(results.map((r) => r.family))].map((fam) => {
        const rs = results.filter((r) => r.family === fam);
        return [fam, ratio(rs.filter((r) => r.keepOk && !r.forbiddenHit.length).length, rs.length)];
      }),
    ),
    latency_ms: { n: latencies.length, p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
  };
}

async function main() {
  const { baseline, split, model, limit } = args();
  const apiKey = process.env.GEMINI_API_KEY ?? "";
  if (baseline !== "B0" && !apiKey) throw new Error("Set GEMINI_API_KEY in your shell to run B1/B2.");
  const raw = readFileSync(FIXTURES, "utf8");
  const fixtures = raw
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Fixture)
    .filter((f) => f.split === split)
    .slice(0, limit);
  const creds: GeminiCredentials = { apiKey, model };
  const results: CaseResult[] = [];
  for (const f of fixtures) {
    const r = await evaluate(f, baseline, creds);
    results.push(r);
    process.stdout.write(`${r.error ? "E" : r.keepOk && !r.forbiddenHit.length ? "." : "x"}`);
  }
  process.stdout.write("\n");

  const run = {
    baseline,
    split,
    model: baseline === "B0" ? "none" : model,
    prompt_version: PROMPT_VERSION,
    fixtures_sha256: createHash("sha256").update(raw).digest("hex"),
    ran_at: new Date().toISOString(),
    metrics: summarize(fixtures, results),
  };
  const stamp = run.ran_at.replace(/[:.]/g, "-");
  writeFileSync(path.join(ROOT, "reports", `${stamp}-${baseline}-${split}.json`), JSON.stringify({ ...run, results }, null, 2));

  const latestPath = path.join(ROOT, "reports", "latest.json");
  const latest = JSON.parse(readFileSync(latestPath, "utf8")) as { runs: (typeof run)[] } & Record<string, unknown>;
  const runs = [...latest.runs.filter((r) => !(r.baseline === baseline && r.split === split)), run].sort((a, b) =>
    `${a.split}${a.baseline}`.localeCompare(`${b.split}${b.baseline}`),
  );
  writeFileSync(latestPath, JSON.stringify({ ...latest, status: "partial", updated_at: run.ran_at, runs }, null, 2) + "\n");
  process.stdout.write(JSON.stringify(run.metrics, null, 2) + "\n");
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
