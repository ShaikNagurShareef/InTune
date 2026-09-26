import { WebhookReceiver } from "livekit-server-sdk";
import { liveKitConfig } from "@/lib/calls/livekit";
import { endCallByRoom } from "@/lib/services/calls";

const MAX_BODY_BYTES = 64 * 1024;

/** LiveKit room events (signed with the API secret). Marks calls ended when their room finishes. */
export async function POST(req: Request): Promise<Response> {
  const config = liveKitConfig();
  if (!config) return new Response(null, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  try {
    const event = await new WebhookReceiver(config.apiKey, config.apiSecret).receive(body, req.headers.get("authorization") ?? "");
    if (event.event === "room_finished" && event.room?.name) await endCallByRoom(event.room.name);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 401 });
  }
}
