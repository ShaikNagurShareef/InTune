import { z } from "zod";
import { route, json, parseJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { registerMedia } from "@/lib/services/media";

const body = z.strictObject({
  storage_key: z.string().min(1).max(300),
  kind: z.enum(["audio", "video"]),
  consent_version: z.string().max(60),
  client_duration_sec: z.number().min(0).max(600),
});

export const maxDuration = 30;

export const POST = route(async (req) => {
  const user = await requireUser(req);
  const input = await parseJson(req, body);
  const row = await registerMedia(user.id, {
    storageKey: input.storage_key,
    kind: input.kind,
    consentVersion: input.consent_version,
    clientDurationSec: input.client_duration_sec,
  });
  return json({ id: row.id, kind: row.kind, duration_sec: row.durationSec, size_bytes: row.sizeBytes }, 201);
});
