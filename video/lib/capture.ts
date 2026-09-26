import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CDPSession, Page } from "@playwright/test";

export interface FrameRef {
  file: string;
  /** Seconds (wall clock). */
  t: number;
}

export interface Mark {
  name: string;
  t: number;
}

export interface Take {
  scene: string;
  frames: FrameRef[];
  marks: Mark[];
  stoppedAt: number;
}

const now = () => Date.now() / 1000;

/**
 * Crisp capture via Chrome's screencast: JPEG frames with their own timestamps (Playwright's built-in
 * video is a low-bitrate VP8 that blurs text). Frames only arrive when the screen changes; the timeline
 * holds each frame until the next one.
 */
export class Recorder {
  private cdp: CDPSession | null = null;
  private frames: FrameRef[] = [];
  private marks: Mark[] = [];
  private count = 0;
  private writes: Promise<void>[] = [];

  constructor(
    private readonly page: Page,
    readonly scene: string,
    private readonly dir: string,
  ) {}

  async start(): Promise<void> {
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(path.join(this.dir, "frames"), { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      const file = path.join("frames", `${String(this.count++).padStart(6, "0")}.jpg`);
      this.frames.push({ file, t: metadata.timestamp ?? now() });
      this.writes.push(Promise.resolve(writeFileSync(path.join(this.dir, file), Buffer.from(data, "base64"))));
      void this.cdp?.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
    });
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    // Nudge a repaint so there is a frame from the very start.
    await this.page.evaluate(() => document.body.getBoundingClientRect());
  }

  mark(name: string): void {
    this.marks.push({ name, t: now() });
  }

  async stop(): Promise<Take> {
    const stoppedAt = now();
    await this.cdp?.send("Page.stopScreencast").catch(() => undefined);
    await Promise.all(this.writes);
    const take: Take = { scene: this.scene, frames: this.frames, marks: this.marks, stoppedAt };
    writeFileSync(path.join(this.dir, "take.json"), JSON.stringify(take, null, 1));
    return take;
  }
}

/** Visible arrow cursor and click ripple (headless browsers draw no cursor). Survives navigations. */
export const CURSOR_SCRIPT = `
(() => {
  const install = () => {
    if (document.getElementById('demo-cursor') || !document.body) return;
    const c = document.createElement('div');
    c.id = 'demo-cursor';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 3L19 12L12 13L9 20L5 3Z" fill="#fff" stroke="#1E2B27" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    c.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:26px;height:26px;left:-40px;top:-40px;filter:drop-shadow(1px 2px 2px rgba(0,0,0,.35));transition:left .06s linear, top .06s linear';
    document.body.appendChild(c);
    const x = window.__demoCursor || { x: 720, y: 400 };
    c.style.left = x.x + 'px'; c.style.top = x.y + 'px';
  };
  document.addEventListener('mousemove', (e) => {
    install();
    window.__demoCursor = { x: e.clientX, y: e.clientY };
    const c = document.getElementById('demo-cursor');
    if (c) { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }
  }, true);
  document.addEventListener('mousedown', (e) => {
    const r = document.createElement('div');
    r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;left:' + (e.clientX - 18) + 'px;top:' + (e.clientY - 18) + 'px;width:36px;height:36px;border-radius:50%;border:3px solid #635B9E;opacity:.9;transition:transform .45s ease-out, opacity .45s ease-out';
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 600);
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
`;

/**
 * Stand-in for the browser's speech recognition on the (unrecorded) speaker's page, so a scripted
 * sentence flows through the app's real caption → interpreter path. The video labels this as simulated.
 */
export const FAKE_SPEECH_SCRIPT = `
(() => {
  window.__recs = [];
  class FakeRecognition {
    constructor() { this.continuous = false; this.interimResults = false; this.lang = 'en-US'; this.onresult = null; this.onend = null; this.onerror = null; this.active = false; window.__recs.push(this); }
    start() { this.active = true; }
    stop() { if (!this.active) return; this.active = false; setTimeout(() => this.onend && this.onend(), 0); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
  const emit = (rec, text, isFinal) => {
    const result = Object.assign([{ transcript: text, confidence: 0.95 }], { isFinal });
    rec.onresult && rec.onresult({ resultIndex: 0, results: [result] });
  };
  window.__say = async (text) => {
    const rec = window.__recs.filter((r) => r.active).pop();
    if (!rec) return false;
    const words = text.split(' ');
    for (const n of [Math.ceil(words.length / 3), Math.ceil((2 * words.length) / 3)]) {
      emit(rec, words.slice(0, n).join(' '), false);
      await new Promise((r) => setTimeout(r, 700));
    }
    emit(rec, text, true);
    return true;
  };
})();
`;
