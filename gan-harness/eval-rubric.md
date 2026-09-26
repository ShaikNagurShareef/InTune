# InTune evaluation rubric (release gates G1–G10 from spec §14)

Each gate is pass/fail with evidence. A security or approval failure blocks the assisted-send path.

| Gate | Pass evidence | How it is checked here |
| --- | --- | --- |
| G1 Complete exchange | Two accounts: compose → approve → receive → simplify → reply | Playwright `e2e/exchange.spec.ts` (stubbed Gemini) + live rehearsal on the Vercel URL |
| G2 User control | Zero sends without matching approval; changed text/audience invalidates approval | Vitest `approval.test.ts`, `publish.test.ts` |
| G3 Meaning fidelity | Critical negation/date/number fixtures preserved or queried | `npm run eval` critical-slot metrics; human review pending |
| G4 Ambiguity | ≥90% clarification recall, ≤15% unnecessary, ≥80% coverage (held-out) | `npm run eval -- --split heldout` |
| G5 Reliability | Retries and concurrent sends produce one post; AI outage keeps manual flow | Vitest idempotency tests; e2e outage test |
| G6 Accessibility | Keyboard-only compose/approve/playback; labels; no autoplay | e2e keyboard test + manual screen reader check |
| G7 Privacy | Cross-account + removed-member denied; media private; key not in bundle or DB | Vitest `authz.test.ts`; bundle grep |
| G8 Responsiveness | p95 latency measured and reported | eval report latency fields |
| G9 Benchmark honesty | Manifest, held-out IDs, baseline comparison, counts, limits | `eval/manifest.json`, `/benchmarks` page |
| G10 Sponsor readiness | Eligibility confirmed, working link, recording | Team action (outside code) |

Scoring for the ECC generator/evaluator loop: 1 point per gate G1–G9 with evidence; pass threshold 7/9 with G2 and G7 mandatory.
