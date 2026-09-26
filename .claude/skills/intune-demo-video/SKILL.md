---
name: intune-demo-video
description: Re-record and re-render InTune's 3–5 minute demo video (Playwright capture of the live app, ElevenLabs narration, burned-in captions, SRT/VTT). Use when the user asks to make, update, re-record or fix the demo video, change its narration, or add a scene.
---

# InTune demo video

The pipeline lives in `video/` and drives the **live** app (https://intune-eta.vercel.app) with the demo accounts. It produces:
- `video/out/final/intune-demo.mp4`: 1920×1080 at 30 fps, H.264 + AAC, captions burned in;
- `intune-demo.srt` and `intune-demo.vtt`;
- `YOUTUBE.md` (title, description, chapters, tags) and `intune-thumbnail.jpg` (1280×720).

Related skills: `ui-demo` (the Discover → Rehearse → Record method this follows), `video-editing` (ffmpeg and voiceover craft), and `remotion-video-creation` (an optional upgrade path; not used by default).

## Prerequisites
- ffmpeg with libass and libx264 (`brew install ffmpeg`), plus the Playwright Chromium installed by the repo.
- **Voice:** `ELEVENLABS_API_KEY`, either in the environment or in `video/.env.local` as `ELEVENLABS_API_KEY=...`. That file is gitignored; never print, log or commit the key.
  - Without a key, the Mac's built-in voice is used (`MAC_VOICE`, default "Samantha"), so a complete video can always be made.
  - Force either voice with `NARRATION=elevenlabs|mac`.
  - Changing the voice changes the timing, so re-record every scene (`npm run video`).
- Optional: `ELEVENLABS_VOICE_ID` (the default is the premade voice "Sarah") and `ELEVENLABS_MODEL_ID` (default `eleven_multilingual_v2`).
- Re-seeding the production demo accounts needs `DATABASE_URL` for production. Pull it into the scratchpad, never into the repo: `vercel env pull <scratch>/prod.env --environment=production`, export it, then delete the file.

## Commands (from the repo root)

| Command | What it does |
| --- | --- |
| `npm run video:preflight` | Checks the key, ffmpeg, site health, demo sign-in, a live AI answer and calls |
| `npm run video:tts -- --dry` | Characters needed. The free tier is about 10k characters a month; the script is about 3.3k. |
| `npm run video:tts` | Synthesizes narration. Cached by content hash in `video/.cache/tts`, so unchanged lines cost nothing. |
| `npm run video:tts -- --voices` | Lists the voices available to the key |
| `npm run video:record -- --rehearse` | Runs every flow without recording, to check selectors and timing |
| `npm run video:record -- --seed` | Re-seeds the demo data, then records every scene |
| `npm run video:record -- --scene plan` | Re-records one scene; the flag can be repeated |
| `npm run video:render` | Builds the final MP4, SRT and VTT |
| `npm run video:render -- --estimate` | Draft with silent audio and estimated caption timing (no key needed) |
| `npm run video` | tts → record → render |

**Check the result:**
- `ffprobe video/out/final/intune-demo.mp4` should show 1920×1080, 30 fps, h264 + aac, 3–5 minutes.
- Make a contact sheet and view it:
  `ffmpeg -i video/out/final/intune-demo.mp4 -vf "fps=1/12,scale=640:-1,tile=4x6" -frames:v 1 video/out/final/sheet.png`

## How it works
- **`video/script.ts`** is the single source of truth. It holds the scenes, and each scene holds beats: one narrated sentence (`say`) plus the actions on screen (`run`). A beat can also have a top-right `note`, and a scene can have a top-left `label`. To edit the story, edit this file.
- **Capture:** Chrome's CDP screencast records crisp JPEG frames with timestamps (`lib/capture.ts`). The viewport is 1440×690 at 4/3 scale, giving 1920×920 frames above a 160 px caption band. A fake cursor and click ripple are injected.
- **Pacing:** each beat lasts at least as long as its narration (`cli/record.ts`).
- **AI waits:** real AI waits go through `Director.ai()`. The edit keeps 1.0 s from the start and 0.4 s from the end, cuts the middle, and labels it "AI working · sped up". A failed attempt is cut completely and retried; after three failures the scene stops.
- **Captions** come from ElevenLabs' character timings, at most 2 lines of 42 characters (`lib/subs.ts`).
- **Title cards** are HTML pages in `video/cards/`. The body's `data-step` reveals the elements marked `data-show="n"`.

## Honesty rules (don't break)
- Every AI result shown is real; never substitute or script AI output. The e2e Gemini stub must not be used.
- Demo people are fictional, and the app's demo banner stays visible.
- The one simulated input, Leo's speech in the call (the fake `SpeechRecognition` in `lib/capture.ts`), is labelled on screen for as long as it is shown.
- The outro credits the ElevenLabs voice, which the free tier requires.

## Troubleshooting
- **A selector fails:** a screenshot is saved to `video/out/takes/<scene>/fail/`. Follow `ui-demo`'s Discover step (dump the visible buttons and links), fix `script.ts`, then `--rehearse`.
- **An AI step is slow or at capacity:** the live app falls back between models. Re-record that scene later; never fake the result.
- **Chat-list locators:** row names include the avatar initial and the last message. Use distinctive regexes such as `PRIYA_DIRECT`; "Priya Chen" also appears in the family circle's preview.
- **Maya's auto-translate** opens a translation panel under every message. The incoming-translation scene opens the chat off camera first, so on camera it lands settled.
- **Stale data from earlier takes:** use `--seed` before recording scenes marked `mutates`.
