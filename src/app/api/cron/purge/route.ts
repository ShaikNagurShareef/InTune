import { purgeExpired } from "@/lib/services/retention";

export const maxDuration = 60;

/** Daily retention job (vercel.json cron). Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ code: "unauthenticated" }, { status: 401 });
  }
  return Response.json(await purgeExpired());
}
