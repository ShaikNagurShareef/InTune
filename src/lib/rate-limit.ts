import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";

/** Fixed-window counter in Postgres; works across serverless instances (SEC07). */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const now = new Date();
  const [row] = await db()
    .insert(rateLimits)
    .values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.windowStart} < ${new Date(now.getTime() - windowSec * 1000)} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${rateLimits.windowStart} < ${new Date(now.getTime() - windowSec * 1000)} THEN ${now} ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning({ count: rateLimits.count });
  if (row && row.count > limit) {
    throw new AppError("rate_limited", "Too many requests. Please wait a moment and try again.");
  }
}
