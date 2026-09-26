import path from "node:path";

export const VIDEO_DIR = path.resolve(import.meta.dirname, "..");
export const CACHE_DIR = path.join(VIDEO_DIR, ".cache");
export const TTS_DIR = path.join(CACHE_DIR, "tts");
export const OUT_DIR = path.join(VIDEO_DIR, "out");
export const TAKES_DIR = path.join(OUT_DIR, "takes");
export const FINAL_DIR = path.join(OUT_DIR, "final");
export const CARDS_DIR = path.join(VIDEO_DIR, "cards");

export const BASE_URL = process.env.DEMO_BASE_URL ?? "https://intune-eta.vercel.app";

/** App viewport; at 4/3 device scale the screencast frames are 1920×920, leaving a 160 px caption band. */
export const VIEWPORT = { width: 1440, height: 690 };
export const DEVICE_SCALE = 4 / 3;
export const FRAME = { width: 1920, height: 920 };
export const OUTPUT = { width: 1920, height: 1080, fps: 30 };
export const BAND_COLOR = "0x14201C";
