import { z } from "zod";
import { route, parseJson } from "@/lib/http";
import { createSessionToken, sessionCookieHeader } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { signIn } from "@/lib/services/accounts";
import { email } from "@/lib/validation";

const body = z.strictObject({ email, password: z.string().min(1).max(200) });

export const POST = route(async (req) => {
  const input = await parseJson(req, body);
  await rateLimit(`signin-ip:${clientIp(req)}`, 60, 900);
  await rateLimit(`signin:${input.email}`, 20, 900);
  const user = await signIn(input.email, input.password);
  const token = await createSessionToken(user.id);
  return Response.json({ id: user.id }, { headers: { "set-cookie": sessionCookieHeader(token) } });
});
