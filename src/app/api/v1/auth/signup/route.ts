import { z } from "zod";
import { route, parseJson } from "@/lib/http";
import { createSessionToken, sessionCookieHeader } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { signUp } from "@/lib/services/accounts";
import { displayName, email, password } from "@/lib/validation";

const body = z.strictObject({ email, password, displayName });

export const POST = route(async (req) => {
  const input = await parseJson(req, body);
  await rateLimit(`signup:${req.headers.get("x-forwarded-for") ?? "local"}`, 10, 3600);
  const user = await signUp(input);
  const token = await createSessionToken(user.id);
  return Response.json({ id: user.id }, { status: 201, headers: { "set-cookie": sessionCookieHeader(token) } });
});
