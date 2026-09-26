import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";

/**
 * LiveKit (WebRTC SFU) configuration from env. Calls are optional: without these variables the app
 * hides call buttons and everything else keeps working.
 *   LIVEKIT_URL         wss://<project>.livekit.cloud  (or ws://localhost:7880 in development)
 *   LIVEKIT_API_KEY / LIVEKIT_API_SECRET
 */
export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

export function liveKitConfig(): LiveKitConfig | null {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret || !/^wss?:\/\//.test(url)) return null;
  return { url, apiKey, apiSecret };
}

export const callsEnabled = (): boolean => liveKitConfig() !== null;

/** HTTP(S) endpoint for the server API, derived from the WebSocket URL. */
const httpUrl = (wsUrl: string) => wsUrl.replace(/^ws/, "http");

export function roomService(config: LiveKitConfig): RoomServiceClient {
  return new RoomServiceClient(httpUrl(config.url), config.apiKey, config.apiSecret);
}

/** Only for joining: LiveKit refreshes it for connected people, and removal is enforced server-side. */
const TOKEN_TTL = "10m";
/** Matches a circle's member cap. */
export const MAX_ROOM_PARTICIPANTS = 20;
/** Seconds a room stays open with nobody in it. */
export const EMPTY_ROOM_TIMEOUT_S = 300;

/** Short-lived join token scoped to one room; identity is the InTune user id (never chosen by the client). */
export async function joinToken(config: LiveKitConfig, room: string, identity: string, name: string): Promise<string> {
  const token = new AccessToken(config.apiKey, config.apiSecret, { identity, name, ttl: TOKEN_TTL });
  token.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    // Voice and camera only: no screen sharing.
    canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA],
    canSubscribe: true,
    canPublishData: true,
  });
  return token.toJwt();
}
