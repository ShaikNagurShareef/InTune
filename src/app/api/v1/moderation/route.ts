import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { moderationQueue } from "@/lib/services/moderation";

export const GET = route(async (req) => json({ reports: await moderationQueue((await requireUser(req)).id) }));
