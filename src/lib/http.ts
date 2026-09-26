import { ZodError, type ZodType } from "zod";
import { AppError, type ErrorBody } from "./errors";

type Handler<C> = (req: Request, ctx: C, requestId: string) => Promise<Response>;

function errorResponse(err: AppError, requestId: string): Response {
  const body: ErrorBody = {
    code: err.code,
    safe_message: err.message,
    retryable: err.retryable,
    request_id: requestId,
  };
  return Response.json(body, { status: err.status, headers: { "x-request-id": requestId } });
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Browsers send Sec-Fetch-Site; server-to-server callbacks (e.g. Blob upload-completed) send neither.
    const site = req.headers.get("sec-fetch-site");
    return site === null || site === "same-origin" || site === "none";
  }
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

/** Wraps a route handler with request IDs, CSRF origin check and uniform error bodies. */
export function route<C = unknown>(handler: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      if (req.method !== "GET" && !sameOrigin(req)) {
        throw new AppError("forbidden", "Cross-origin requests are not allowed.");
      }
      return await handler(req, ctx, requestId);
    } catch (err) {
      if (err instanceof AppError) return errorResponse(err, requestId);
      if (err instanceof ZodError) {
        return errorResponse(new AppError("invalid_input", "Some fields are not valid."), requestId);
      }
      // Log without request content.
      console.error(`[${requestId}] unhandled`, err instanceof Error ? err.name + ": " + err.message : "error");
      return errorResponse(new AppError("internal", "Something went wrong. Your draft is kept."), requestId);
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("invalid_input", "Request body must be JSON.");
  }
  return schema.parse(raw);
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}
