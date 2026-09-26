import { createHash, randomBytes } from "node:crypto";

export const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

/** Hashes exactly what the sender sees; only Unicode normalization is applied. */
export const contentHash = (text: string): string => sha256(text.normalize("NFC"));

/** Audience = circle + reply target + the exact active member set at approval time. */
export function audienceHash(circleId: string, replyToId: string | null, memberIds: readonly string[]): string {
  const members = [...memberIds].sort().join(",");
  return sha256(`${circleId}|${replyToId ?? ""}|${members}`);
}

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");
