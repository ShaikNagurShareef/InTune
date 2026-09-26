# InTune: an AI interpreter between people who communicate differently

**Team Coding Claws (HackGT 13):** Nagur Shareef Shaik · Sahith Reddy Thummala · Pranav Nagothu · Geethanjali Nagaboina

**Live:** https://intune-eta.vercel.app · **Code:** https://github.com/ShaikNagurShareef/InTune · **Demo accounts:** see [DEMO.md](DEMO.md)

## Why I built this

I grew up with a close friend who found conversations hard. In groups, he struggled to keep up, and I often watched him get lost. I always wished I could build something to help him. Now AI makes that possible, so I built InTune: nobody should have to feel lost in a group, and no friend should have to watch it happen.

## Who it's for

InTune is for autistic adults, and for the family, friends and colleagues they want to stay close to.

Autistic adults report much more loneliness than non-autistic adults ([Grace et al., 2022](https://journals.sagepub.com/doi/full/10.1177/13623613221077721)). The cause is usually not a lack of wanting to connect. It's a mismatch between two ways of communicating. In one study, stories passed between autistic people held their detail as well as stories passed between non-autistic people. In **mixed** chains, the detail fell apart much faster, and so did rapport ([Crompton et al., 2020](https://journals.sagepub.com/doi/10.1177/1362361320919286)). This is the "double empathy problem": the gap runs both ways.

## The idea

Most tools try to coach the autistic person to talk "more normally". **InTune takes the opposite approach. Nobody has to change how they communicate: AI interprets in both directions, inside private circles.**

- **Messages they receive are made plain.** When "It'd be nice if you could maybe bring something small?" arrives, the reader privately sees the message in plain words, *what they're asking*, *whether a reply is needed*, and *what's unclear*.
- **Messages they send keep their meaning.** "sat ok. no loud music pls. leave 8 maybe" becomes "Saturday is OK. Please no loud music. I may leave at 8." The sender sees exactly what others will read and approves it before anything is sent.
- **Group chat becomes one plan.** *Plan it together* reads a scattered chat plus what each person shared about how they like to communicate. It drafts one plan that fits everyone: when, where, who brings what, *how the plan meets each person's needs* (a quiet place for Maya, a morning start for Leo, exact start and end times for Jordan), and direct yes/no questions for anything still open.
- **Live calls get an interpreter.** Voice and video calls, one-to-one or in a group, come with live captions. A private ✨ interpreter shows each line in plain words. With "Say it for me", people can type and have it read aloud to the others, and one-tap signals ("Please slow down", "I need a short break") let anyone take part without having to interrupt.

It also builds in social supports people already use: tone tags (*just asking*, *not upset*, *no reply needed*), a "How to talk with me" card, energy status ("🔋 low energy", "replies may be slow"), and calm sensory themes.

## How it strengthens connection

The goal is not more screen time. It's fewer misunderstandings between people who already care about each other:
- a parent's hint becomes an answerable question;
- a colleague's vague deadline becomes a time;
- a group's "we should hang out sometime" becomes a Sunday morning plan that works for everyone.

Every feature works in groups (friend circles, families, teams) as well as one-to-one, and treats autistic ↔ autistic conversations as just as normal as mixed ones.

## Why AI is essential

The hard part of this problem is **meaning**. Rules can't tell that "maybe bring something small?" is a request, or that "leave 8 maybe" is a time and a condition. Rules can't turn eleven scattered messages and four people's needs into one plan, or explain a spoken sentence while the call is happening. That kind of interpretation requires a language model.

What AI **never** does is just as deliberate:
- **It never sends anything.** Every AI-assisted message and plan is bound to the sender's approval of the exact text and audience (hash-checked; any edit makes it invalid).
- **It never loses facts without saying so.** A deterministic check flags any "no/not", number, time, name or condition that the AI dropped or added.
- **It never guesses feelings or diagnoses.** Reading help is visible only to the reader. Nothing from calls is recorded.
- **It never stops you communicating.** Messaging, phrases, calls, blocking and reporting all work without AI. The AI falls back across Gemini and OpenAI models automatically, with optional Llama.

## Built

Next.js 16 + TypeScript on Vercel, Postgres (Neon), and LangGraph for the translate/clarify/review flow. AI runs on Gemini, with OpenAI as a fallback and optional Llama. Calls use LiveKit (WebRTC).

The code has 101 unit/integration tests and 5 two-browser end-to-end tests. There is also an evaluation harness on 110 authored cases (dev and held-out). So far only the no-AI baseline has been run and published at `/benchmarks`; the AI runs are the next step. These are scripted checks, not clinical claims.

Measured on the live site today:
- interpreter: about 6 s per spoken line;
- a plan from 11 messages: about 11 s;
- joining a call: under 10 s.

Everything in the demo is fictional and labelled as such. The demo messages are pre-written and never labelled as AI; every AI moment in the video happens live.
