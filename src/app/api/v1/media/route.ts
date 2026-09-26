import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { route, json } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { AppError } from "@/lib/errors";
import { storageMode } from "@/lib/media/storage";
import { rateLimit } from "@/lib/rate-limit";
import { MEDIA_LIMITS, uploadPrefix } from "@/lib/services/media";

const TOKEN_TTL_MS = 5 * 60 * 1000;
const payload = z.object({ kind: z.enum(["audio", "video"]) });

/**
 * Issues a short-lived, single-path private upload token (SEC01). The browser uploads directly to the
 * private Blob store; the file is only usable after POST /v1/media/register verifies it.
 */
export const POST = route(async (req) => {
  if (storageMode() !== "blob") throw new AppError("invalid_input", "Direct uploads are not configured.");
  const body = (await req.json()) as HandleUploadBody;
  if (body.type === "blob.generate-client-token") {
    const user = await requireUser(req);
    await rateLimit(`upload:${user.id}`, 40, 3600);
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { kind } = payload.parse(JSON.parse(clientPayload ?? "{}"));
        if (!pathname.startsWith(uploadPrefix(user.id)) || pathname.includes("..")) {
          throw new AppError("forbidden", "Invalid upload path.");
        }
        return {
          allowedContentTypes: [kind === "audio" ? "audio/*" : "video/*"],
          maximumSizeInBytes: MEDIA_LIMITS[kind].maxBytes,
          addRandomSuffix: true,
          validUntil: Date.now() + TOKEN_TTL_MS,
        };
      },
      onUploadCompleted: async () => undefined,
    });
    return json(result);
  }
  // Upload-completed callbacks are signed by Vercel and verified inside handleUpload.
  return json(await handleUpload({ request: req, body, onBeforeGenerateToken: async () => ({}), onUploadCompleted: async () => undefined }));
});
