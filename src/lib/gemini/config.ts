/** Pinned defaults (spec §7 "Gemini selection and budgets"). Users may pick another model in Settings. */
export const DEFAULT_MODEL = "gemini-2.5-flash";

/** Preference order when choosing a default from the models a key can access. */
export const PREFERRED_MODELS = ["gemini-2.5-flash", "gemini-3-flash", "gemini-flash-latest", "gemini-2.0-flash"];

export const PROMPT_VERSION = "p2-2026-09-26";
export const MAX_OUTPUT_TOKENS = 800;
export const ATTEMPT_TIMEOUT_MS = 15_000;
export const JOB_DEADLINE_MS = 45_000;
export const MAX_TRANSIENT_RETRIES = 2;
export const MAX_AUTO_CLARIFICATION_ROUNDS = 2;
export const MAX_CHOICES = 3;
