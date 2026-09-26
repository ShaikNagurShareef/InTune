# InTune

**Say it your way. Send it only when it's right.**

**Live:** https://intune-eta.vercel.app · deployed automatically from `main` on Vercel

InTune is a private communication community for adults who choose communication support, and the people they talk with. You can express a message by typing, tapping phrases, recording up to 30 seconds of audio, or recording a 15-second video. Gemini helps turn it into words and asks one question when something is unclear. Nothing is sent until you approve the exact text and audience. Recipients can open a private "Make clearer" version of any message and reply the same way.

Built for HackGT 13 (Meta challenge: *Bringing People Closer Together with AI*) from `InTune_Project_Requirements.docx`, using the [ECC](https://github.com/affaan-m/ECC) Claude Code harness.

## Try it

**Fastest:** open the live site and press **Try as Maya Chen** (or any demo person) on the sign-in page. The demo has scripted autistic ↔ autistic and autistic ↔ non-autistic conversations — see [DEMO.md](DEMO.md) for the cast and a three-minute walkthrough.

Or start fresh:

1. Create an account, then create a circle.
2. Invite someone with a private, single-use link (expires in 24 hours).
3. Optional: open **Gemini key** and paste your own [Gemini API key](https://aistudio.google.com/apikey). Without a key, typing, phrases, sending, reading, listening, blocking and reporting all still work.
4. Write something like *"want come dinner friday loud outside?"* and press **Help me word it**.

## How it protects the person's voice

| Guarantee | Where it's enforced |
| --- | --- |
| No message is sent without approval of the exact text and audience; any edit or membership change invalidates it | `src/lib/services/publish.ts` (`approveDraft`, `publishMessage`) |
| Retried or double-clicked sends create one post | Unique `(sender_id, idempotency_key)` + payload hash, one transaction |
| The model can't approve, send or change who sees a message | Delivery is app code, never a LangGraph node or model tool; state fields are server-only (strict schemas) |
| It asks instead of guessing | LangGraph `clarify` interrupt, one question, up to 3 choices + "Something else", max two automatic rounds |
| Lost "no / not", dates, numbers or invented feelings are flagged and must be acknowledged | Model meaning check + deterministic critical-slot diff (`src/lib/meaning/critical-slots.ts`) |
| Your key stays yours | BYOK: stored only in your browser; sent per request; never persisted, logged or checkpointed (tested) |
| Recordings stay private | Private Blob store, verified by signature and size, erased after transcription or within 24 h |
| Unrelated users learn nothing | Every route checks session + membership/ownership and returns the same 404 |

## Architecture

```
Browser (Next.js client) ──► Next.js route handlers (/api/v1/*) ──► Postgres (Drizzle)
   │  BYOK key in localStorage     │  session, authz, approval, idempotent publish
   │  x-gemini-key header          ├─► LangGraph.js assist graph ──► Gemini (@google/genai)
   └─► Vercel Blob (private) ◄─────┘     validate → interpret → [confirm transcript] → phrasebook
                                          → compose → check meaning → clarify ⟲ | review
                                          (Postgres checkpointer; key passed by closure, never state)
```

- **Stack:** Next.js 16 (App Router), TypeScript, Tailwind 4, Drizzle ORM, Postgres (Neon), LangGraph.js with `PostgresSaver`, `@google/genai`, Vercel Blob (private), `jose` sessions.
- **Realtime:** polling every 3 s with stable `(created_at, id)` ordering (Vercel has no websockets).
- **Spec endpoints:** `POST /v1/drafts`, `PATCH /v1/drafts/{id}` (expected_version), `POST /v1/drafts/{id}/assist`, `GET /v1/jobs/{id}`, `POST /v1/jobs/{id}/clarify`, `POST /v1/drafts/{id}/approve`, `POST /v1/messages` (Idempotency-Key), `GET /v1/circles/{id}/messages` (cursor), `POST /v1/messages/{id}/simplify`, plus circles, invites, membership, phrasebook, blocks, reports, media and account deletion.

## Evaluation

`/benchmarks` shows B0 (no model) vs B1 (one prompt) vs B2 (full workflow) on 110 InTune-authored fixtures, split into dev and held-out sets, with raw counts. See `eval/manifest.json` for fixture hashes, what's deferred (LibriSpeech, TORGO, UASpeech, ASSET) and why. These are automatic checks on custom scripted cases, not a clinical or public benchmark; human review is pending.

```bash
npm run eval -- --baseline B0 --split dev
GEMINI_API_KEY=... npm run eval -- --baseline B2 --split heldout
```

## Develop

```bash
cp .env.example .env.local           # DATABASE_URL, AUTH_SECRET
npm install
npm run db:migrate                   # app schema + LangGraph checkpoint tables
npm run dev
npm test                             # Vitest on in-process Postgres (PGlite), stubbed Gemini
npm run test:e2e                     # Playwright two-browser exchange (test-only Gemini stub)
```

## Scope and limits

Built: all P0 requirements in the spec. Deferred: P1 (visual object context, activity RSVP, more languages, MCP adapter) and P2 (streaming, public communities, A2A, WhatsApp, acoustic training). Known limits are listed in the app at `/about`, including: English only; polling instead of push; server duration checks are best-effort for some recorder formats; circle owners act as moderators; Gemini eligibility for the Meta challenge is unconfirmed.

InTune is communication support. It does not diagnose, infer mood or capacity, or provide therapy.
