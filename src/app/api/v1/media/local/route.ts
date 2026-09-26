import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { AppError } from "@/lib/errors";
import { randomToken } from "@/lib/hash";
import { storageMode, writeLocalObject } from "@/lib/media/storage";
import { MEDIA_LIMITS, uploadPrefix, type MediaKind } from "@/lib/services/media";

/** Development-only upload path used when no Blob store is configured. */
export const POST = route(async (req) => {
  if (storageMode() !== "local" || process.env.NODE_ENV === "production") {
    throw new AppError("not_found", "Not available.");
  }
  const user = await requireUser(req);
  const kind = (new URL(req.url).searchParams.get("kind") === "video" ? "video" : "audio") as MediaKind;
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length > MEDIA_LIMITS[kind].maxBytes) throw new AppError("too_large", "File is too large.");
  const pathname = `${uploadPrefix(user.id)}${randomToken(16)}`;
  await writeLocalObject(pathname, bytes);
  return json({ pathname }, 201);
});
