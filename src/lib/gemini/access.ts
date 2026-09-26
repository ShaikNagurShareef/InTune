import { rateLimit } from "@/lib/rate-limit";
import { credentialsFromRequest, type GeminiCredentials } from "./client";

const SERVER_KEY_DAILY_CALLS_PER_USER = 200;
const DAY_SEC = 24 * 60 * 60;

/**
 * Credentials for an AI request by a signed-in person. Their own key always wins; the operator's shared
 * key is capped per person per day so one account can't run up the bill.
 */
export async function aiCredentials(req: Request, userId: string): Promise<GeminiCredentials> {
  const creds = credentialsFromRequest(req);
  if (creds.source === "server") await rateLimit(`server-ai:${userId}`, SERVER_KEY_DAILY_CALLS_PER_USER, DAY_SEC);
  return creds;
}
