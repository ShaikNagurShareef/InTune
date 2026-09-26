export type ErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "stale_version"
  | "conflict"
  | "too_large"
  | "rate_limited"
  | "ai_unavailable"
  | "ai_key_missing"
  | "ai_malformed"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  stale_version: 409,
  conflict: 409,
  too_large: 413,
  rate_limited: 429,
  ai_unavailable: 503,
  ai_key_missing: 503,
  ai_malformed: 503,
  internal: 500,
};

const RETRYABLE: ReadonlySet<ErrorCode> = new Set(["rate_limited", "ai_unavailable", "internal"]);

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: ErrorCode, safeMessage: string) {
    super(safeMessage);
    this.code = code;
    this.status = STATUS[code];
    this.retryable = RETRYABLE.has(code);
  }
}

export const notFound = (): AppError =>
  new AppError("not_found", "This item is not available.");

export interface ErrorBody {
  code: ErrorCode;
  safe_message: string;
  retryable: boolean;
  request_id: string;
}
