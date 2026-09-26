@AGENTS.md

# InTune

Private communication circles where Gemini helps people word a message and the sender approves the exact text and audience before anything is sent. Spec: `InTune_Project_Requirements.docx`; build contract: `gan-harness/spec.md` and `gan-harness/eval-rubric.md`.

Stack: Next.js 16 (App Router, `src/`), Drizzle + Postgres (Neon in prod, local Postgres in dev, PGlite in tests), LangGraph.js, `@google/genai`, Vercel Blob (private), jose session cookie. ECC rules live in `.claude/rules/ecc/`.

## Commands
- `npm run dev` / `npm run build` / `npm run lint` / `npm run typecheck`
- `npm test` (Vitest, PGlite) · `npm run test:e2e` (Playwright, stubbed Gemini)
- `npm run db:generate` then `npm run db:migrate` (uses `DATABASE_URL`)
- `npm run eval -- --baseline B2 --split dev` (needs `GEMINI_API_KEY` in your shell)
- `npm run seed:demo` resets the scripted `@intune.demo` accounts (see DEMO.md)

## Invariants (do not break)
- Gemini keys: a person's own key (browser-only, sent per request in `x-gemini-key`) always wins; otherwise the operator's shared `GEMINI_API_KEY` env var is used, capped per user per day (`src/lib/gemini/access.ts`). Keys are never stored, logged, returned to clients, or put in LangGraph config/state.
- No model output can set approval. Approval binds user, draft id, version, content hash and audience hash; any edit invalidates it. Publishing happens only in `publishMessage()` (one transaction, idempotency key unique per sender).
- Manual messaging, phrases, block and report must work with no key and with Gemini down.
- Every route checks session + ownership/membership; unrelated users get a non-disclosing 404.
