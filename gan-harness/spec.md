# InTune build spec (P0), condensed from InTune_Project_Requirements.docx

Generated for the ECC `orch-build-mvp` pipeline. The .docx remains the source of truth.

## Product
A private social community. A person expresses a message by typing, tapping symbol phrases, recording up to 30 s of audio, or recording/uploading up to 15 s of video. Gemini transcribes and offers wording help (Keep my wording / Make clearer / Make shorter), asks one clarifying question when meaning is missing, and never sends anything: the person previews the exact text and audience and approves it. Recipients can read, listen (device TTS), or open a private "Make clearer" reading aid beside the original, then reply through the same flow.

## Platform decisions (this build)
- Next.js 16 on Vercel; Postgres (Neon); Vercel Blob private store for media; polling instead of websockets.
- BYOK Gemini: key stored only in the user's browser, sent per request, never persisted server-side.
- LangGraph.js graph: validateInput → interpret → retrievePhrases → compose → checkMeaning → clarify (interrupt) | review (interrupt). Delivery is app code, never a graph node or model tool.

## Vertical slices (in build order)
1. Accounts + sessions, preferences, circles, invitations, membership, manual text posts, feed with cursor pagination and polling. (FR01–07, FR09, FR11, FR18)
2. Drafts + exact approval + idempotent publish transaction. (FR21, FR22)
3. Gemini BYOK settings, text assistance through LangGraph with clarification and meaning check. (FR15–17, FR27)
4. Symbols board + phrasebook + memory control. (FR12, FR25, FR26)
5. Audio + video capture/upload, private media, transcription. (FR13, FR14, FR28)
6. Recipient reading aid (simplify), TTS playback. (FR23, FR24)
7. Block, report, moderator queue, deletion of data/account, retention cron. (FR08, FR29, SEC05–06)
8. Diagnostics, eval harness (B0/B1/B2 on custom fixtures), benchmarks page.

## Deferred (disclosed in UI + README)
P1: visual object context, activity RSVP, richer dashboard, more languages, MCP adapter. P2: streaming, public communities, A2A, WhatsApp, acoustic training, switch access.
