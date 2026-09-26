@AGENTS.md

# InTune

Private communication circles where Gemini helps people word a message and the sender approves the exact text and audience before anything is sent. Spec: `InTune_Project_Requirements.docx`; build contract: `gan-harness/spec.md` and `gan-harness/eval-rubric.md`.

Stack: Next.js 16 (App Router, `src/`), LiveKit (calls), Drizzle + Postgres (Neon in prod, local Postgres in dev, PGlite in tests), LangGraph.js, `@google/genai`, Vercel Blob (private), jose session cookie. ECC rules live in `.claude/rules/ecc/`.

## Commands
- `npm run dev` / `npm run build` / `npm run lint` / `npm run typecheck`
- `npm test` (Vitest, PGlite) · `npm run test:e2e` (Playwright, stubbed Gemini; needs `livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1` for the call test)
- `npm run db:generate` then `npm run db:migrate` (uses `DATABASE_URL`)
- `npm run eval -- --baseline B2 --split dev` (needs `GEMINI_API_KEY` in your shell)
- `npm run seed:demo` resets the scripted `@intune.demo` accounts (see DEMO.md)

## Invariants (do not break)
- AI keys (Gemini or OpenAI): a person's own key (browser-only, sent per request in `x-gemini-key` / `x-openai-key`, provider chosen with `x-ai-provider`) always wins; otherwise the operator's shared `GEMINI_API_KEY`, then `OPENAI_API_KEY`, is used, capped per user per day (`src/lib/gemini/access.ts`). Keys are never stored, logged, returned to clients, or put in LangGraph config/state. Video transcription needs Gemini.
- No model output can set approval. Approval binds user, draft id, version, content hash and audience hash; any edit invalidates it. Publishing happens only in `publishMessage()` (one transaction, idempotency key unique per sender).
- Manual messaging, phrases, block and report must work with no key and with Gemini down.
- Every route checks session + ownership/membership; unrelated users get a non-disclosing 404.
- Calls (LiveKit, optional via `LIVEKIT_URL/API_KEY/API_SECRET`): join tokens only for current members (blocks respected), one room per call. Captions, interpreter output and "say it for me" lines are ephemeral (data channel, never stored); AI wording is only a suggestion the person approves before it's spoken.
