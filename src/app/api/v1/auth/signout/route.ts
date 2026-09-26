import { route } from "@/lib/http";
import { sessionCookieHeader } from "@/lib/auth/session";

export const POST = route(async () =>
  Response.json({ ok: true }, { headers: { "set-cookie": sessionCookieHeader(null) } }),
);
