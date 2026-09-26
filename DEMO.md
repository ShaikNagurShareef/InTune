# InTune demo guide

Live: **https://intune-eta.vercel.app** · all demo people are fictional; conversations are scripted, non-sensitive examples.

## Sign in

Use the **Try as…** buttons on the sign-in page, or sign in manually:

| Account | Who they are in the story |
| --- | --- |
| `maya@intune.demo` | Maya — autistic adult; prefers text; status “replies may be slow”; phrasebook: *tea time*, *loud box* |
| `leo@intune.demo` | Leo — autistic adult; uses phrases when talking is hard (*red light / green light*); status “low energy” |
| `priya@intune.demo` | Priya — Maya’s sister; learning to be direct and to use tone tags |
| `sam@intune.demo` | Sam — Leo’s coworker; tends to write indirectly |
| `jordan@intune.demo` | Jordan — autistic; runs board-game night; likes plans with a start, place and end |
| `grace@intune.demo`, `ava@intune.demo` | Maya’s mom; Leo’s manager |
| `guest@intune.demo` | A new user with an invitation waiting in **Requests** |

Password for all: `InTune-demo-2026`. Demo accounts can’t be deleted; re-run `npm run seed:demo` to reset everything.

## What’s in the data

| Conversation | Type | What it shows |
| --- | --- | --- |
| **Board Game Night 🎲** (Jordan, Maya, Leo) | Autistic ↔ autistic | Literal plan (time, place, end), sensory request (“lights dim?”), “leaving early is always OK”, tone tags, Leo’s *green light* |
| **Chen Family 🏡** (Priya, Maya, Grace) | Autistic ↔ non-autistic | Mom’s vague “we should probably do something… maybe?” → Maya: “Can you say that more directly?” → Priya rewrites with a date and time and adds *no reply needed* |
| **Studio Team 💼** (Sam, Leo, Ava) | Autistic ↔ coworkers | “ready-ish by Thursday?” → Leo asks *full deck? what time?* → clear deadline |
| Maya ↔ Leo | Direct, autistic ↔ autistic | *red light* → “You don’t need to reply. I’m here later.” (tagged *no reply needed · not upset*) |
| Maya ↔ Priya | Direct, autistic ↔ non-autistic | “Can we text instead?” → Priya stops asking about calls; latest message is vague on purpose |
| Leo ↔ Sam | Direct, workplace | “any chance you could take a look at my slides at some point?” → which slides, by when |

Seeded messages are typed text and are **never labelled AI-assisted** — AI features are shown live.

## Walkthrough (about four minutes)

1. **(0:00) Maya’s Chats.** Sign in as Maya. Point out the status (“replies may be slow”), unread badges, and Leo’s 🔋 status on his avatar.
2. **(0:20) Autistic ↔ autistic.** Open *Board Game Night*: exact plan, dim lights, tone chips like *just asking · no rush*. Open **ⓘ Details** → Leo’s *How to talk with them* card.
3. **(0:50) Understanding a vague message.** Add a Gemini key (**Gemini key** in the sidebar). Open the chat with **Priya**, tap **💡** on “It’d be nice if you could maybe bring something small?” → *What they’re asking*, *Reply needed?*, *What’s unclear* — private to Maya, never guessing feelings.
4. **(1:30) Replying safely.** Type “yes bring juice”, tap **✨ → Keep my wording**, add tone *not upset*, review the **exact bubble** they will see, then **Approve and send**. If a detail is missing, InTune asks one question instead of guessing.
5. **(2:10) The other side.** In a second browser, **Try as Priya**: the reply arrives with Maya’s tone tag; Priya’s own messages show how family members learn to add *no reply needed*.
6. **(2:35) Invitations.** **Try as Demo Guest** → **Requests (1)**: see who’s in *Board Game Night* before joining.
7. **(2:50) Live call.** As Maya, open *Board Game Night* and press **📹**. The pre-join screen shows the help options. On the second computer, Leo sees **Call in progress · Join**. As Leo, tap **Signal → Please slow down**: it appears on Leo's tile on Maya's screen. Then, as Leo, tap **Say it → "need break back 5" → ✨ Make it clear → Say this**: Maya sees the line and hears it read aloud. With a Gemini key, speak a sentence and Leo's **Captions** panel shows the ✨ interpreter's plain-words version. Captions need Chrome, Edge or Safari, and a microphone.
8. **(3:30) Close.** Nothing is sent without approval of exact words, tone and audience; no diagnosis; your key stays in your browser.

## Resetting

```bash
npm run seed:demo                      # local
DATABASE_URL=<prod> npm run seed:demo  # production (demo accounts only; real users untouched)
```
