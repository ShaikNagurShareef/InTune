import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { setCommCard } from "@/lib/services/accounts";
import { commCard } from "@/lib/social";

/** "How to talk with me" card; shown only to people who share a circle with you. */
export const PUT = route(async (req) => {
  const user = await requireUser(req);
  const card = await parseJson(req, commCard);
  await setCommCard(user.id, card);
  return json(card);
});
