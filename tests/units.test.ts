import { describe, expect, it } from "vitest";
import { diffSlots, extractSlots } from "@/lib/meaning/critical-slots";
import { sniffContainer } from "@/lib/media/sniff";
import { createSessionToken, readCookie, verifySessionToken } from "@/lib/auth/session";
import { audienceHash, contentHash } from "@/lib/hash";
import { messageText } from "@/lib/validation";

describe("critical slots", () => {
  it("detects dropped negation", () => {
    expect(diffSlots("I can't come tomorrow", "I can come tomorrow").lost).toEqual([{ kind: "negation", value: "negation" }]);
  });
  it("detects changed day and number", () => {
    const d = diffSlots("Meet Sam at 5 on Friday", "Meet Sam at 6 on Saturday");
    expect(d.lost.map((s) => s.value).sort()).toEqual(["5", "friday"]);
    expect(d.added.map((s) => s.value).sort()).toEqual(["6", "saturday"]);
  });
  it("treats number words and digits alike", () => {
    expect(diffSlots("two tickets", "2 tickets").lost).toEqual([]);
  });
  it("keeps conditions", () => {
    expect(extractSlots("Only if it is quiet").some((s) => s.kind === "condition")).toBe(true);
  });
  it("tolerates re-capitalised names", () => {
    expect(diffSlots("tell maya ok", "Tell Maya OK.").lost).toEqual([]);
  });
});

describe("file signatures", () => {
  const bytes = (s: string, pad = 16) => new Uint8Array([...Buffer.from(s, "latin1"), ...new Array(pad).fill(0)]);
  it("recognises containers and rejects others", () => {
    expect(sniffContainer(bytes("RIFF\0\0\0\0WAVE"))).toBe("wav");
    expect(sniffContainer(bytes("\0\0\0\x18ftypmp42"))).toBe("mp4");
    expect(sniffContainer(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new Array(12).fill(0)]))).toBe("webm");
    expect(sniffContainer(bytes("<html><script>"))).toBeNull();
  });
});

describe("session", () => {
  it("round-trips and rejects tampering", async () => {
    const token = await createSessionToken("user-1");
    expect(await verifySessionToken(token)).toBe("user-1");
    expect(await verifySessionToken(token.slice(0, -2) + "xx")).toBeNull();
    expect(readCookie(`a=1; intune_session=${token}`, "intune_session")).toBe(token);
  });
});

describe("hashing and validation", () => {
  it("audience hash is order-independent but membership-sensitive", () => {
    expect(audienceHash("c", null, ["a", "b"])).toBe(audienceHash("c", null, ["b", "a"]));
    expect(audienceHash("c", null, ["a"])).not.toBe(audienceHash("c", null, ["a", "b"]));
  });
  it("content hash preserves line breaks", () => {
    expect(contentHash("a\nb")).not.toBe(contentHash("a b"));
  });
  it("rejects whitespace-only and over-long messages", () => {
    expect(messageText.safeParse("   \n ").success).toBe(false);
    expect(messageText.safeParse("x".repeat(2001)).success).toBe(false);
    expect(messageText.safeParse("Line one\nLine two").success).toBe(true);
  });
});
