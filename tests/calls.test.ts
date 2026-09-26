import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import { AppError } from "@/lib/errors";
import { setGeminiTransport, type GenerateRequest } from "@/lib/gemini/client";
import { LIVE_INTERPRET_SYSTEM, LIVE_SAY_SYSTEM } from "@/lib/gemini/prompts";
import { deleteCircle, listCircles, removeMember } from "@/lib/services/circles";
import { callToken, endCall, getActiveCall, startCall } from "@/lib/services/calls";
import { openDirect } from "@/lib/services/direct";
import { interpretUtterance, suggestSay } from "@/lib/services/interpreter";
import { blockUser } from "@/lib/services/moderation";
import { circleWithMembers, creds, freshDb } from "./helpers";

const isCode = (code: string) => (e: unknown) => e instanceof AppError && e.code === code;
const API_KEY = "unit-devkey";
const API_SECRET = "unit-test-livekit-secret-0123456789abcdef";
const saved = { ...process.env };

describe("live calls", () => {
  beforeAll(() => {
    // Nothing listens here: room lookups fail fast and calls are treated as freshly started.
    process.env.LIVEKIT_URL = "ws://127.0.0.1:9";
    process.env.LIVEKIT_API_KEY = API_KEY;
    process.env.LIVEKIT_API_SECRET = API_SECRET;
  });
  afterAll(() => {
    process.env = saved;
  });
  beforeEach(freshDb);

  it("members start or join the one call per circle; outsiders get a non-disclosing 404", async () => {
    const { a, b, c, circleId } = await circleWithMembers();
    const first = await startCall(a.id, circleId, "video");
    const again = await startCall(b.id, circleId, "audio");
    expect(again.id).toBe(first.id);
    expect(again.kind).toBe("video");
    await expect(startCall(c.id, circleId, "audio")).rejects.toSatisfy(isCode("not_found"));
    await expect(getActiveCall(c.id, circleId)).rejects.toSatisfy(isCode("not_found"));
    await expect(callToken(c, first.id)).rejects.toSatisfy(isCode("not_found"));
  });

  it("join tokens are scoped to that call's room and the member's identity", async () => {
    const { a, circleId } = await circleWithMembers();
    const call = await startCall(a.id, circleId, "audio");
    const { token, url } = await callToken(a, call.id);
    expect(url).toBe("ws://127.0.0.1:9");
    const claims = await new TokenVerifier(API_KEY, API_SECRET).verify(token);
    expect(claims.sub).toBe(a.id);
    expect(claims.name).toBe(a.displayName);
    expect(claims.video).toMatchObject({ roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    expect(claims.video?.room).toMatch(/^intune-[0-9a-f-]{36}$/);
    expect(claims.video?.roomAdmin).toBeFalsy();
  });

  it("in a group only the starter or owner can end the call for everyone; then it's over", async () => {
    const { a, b, circleId } = await circleWithMembers();
    const call = await startCall(b.id, circleId, "audio");
    expect((await callToken(b, call.id)).canEnd).toBe(true);
    expect((await callToken(a, call.id)).canEnd).toBe(true); // owner
    expect((await listCircles(a.id)).find((x) => x.id === circleId)?.live).toBe(true);
    await endCall(a.id, call.id);
    expect(await getActiveCall(b.id, circleId)).toBeNull();
    expect((await listCircles(b.id)).find((x) => x.id === circleId)?.live).toBe(false);
    await expect(callToken(b, call.id)).rejects.toSatisfy(isCode("conflict"));
    await expect(interpretUtterance(b.id, call.id, "hello there how are you", "Ana", creds)).rejects.toSatisfy(isCode("conflict"));
  });

  it("other members can leave a group call but not end it for everyone", async () => {
    const { a, b, circleId } = await circleWithMembers();
    const call = await startCall(a.id, circleId, "audio");
    expect((await callToken(b, call.id)).canEnd).toBe(false);
    await expect(endCall(b.id, call.id)).rejects.toSatisfy(isCode("forbidden"));
    expect(await getActiveCall(a.id, circleId)).not.toBeNull();
  });

  it("removed members can't rejoin, and deleting the circle ends its call", async () => {
    const { a, b, circleId } = await circleWithMembers();
    const call = await startCall(a.id, circleId, "video");
    await removeMember(a.id, circleId, b.id);
    await expect(callToken(b, call.id)).rejects.toSatisfy(isCode("not_found"));
    await deleteCircle(a.id, circleId);
    await expect(callToken(a, call.id)).rejects.toSatisfy(isCode("not_found"));
  });

  it("blocking ends the direct call and hides it from the blocked person", async () => {
    const { a, b } = await circleWithMembers();
    const { id } = await openDirect(a.id, b.id);
    const call = await startCall(a.id, id, "audio");
    expect((await callToken(b, call.id)).canEnd).toBe(true); // either person can end a 1-to-1 call
    await blockUser(b.id, a.id);
    expect(await getActiveCall(a.id, id)).toBeNull();
    await expect(startCall(a.id, id, "audio")).rejects.toSatisfy(isCode("forbidden"));
    await expect(callToken(a, call.id)).rejects.toSatisfy(isCode("conflict"));
  });

  it("the interpreter explains a line in plain words and flags details it dropped; nothing is stored", async () => {
    const { a, b, circleId } = await circleWithMembers();
    const call = await startCall(a.id, circleId, "audio");
    const seen: GenerateRequest[] = [];
    setGeminiTransport({
      async generate(_c, req) {
        seen.push(req);
        expect(req.system).toBe(LIVE_INTERPRET_SYSTEM);
        return JSON.stringify({ plain: "Can we meet on Friday?", asking: "Can you meet Friday?", reply_expected: "yes", unclear: "" });
      },
    });
    const result = await interpretUtterance(b.id, call.id, "so um could we maybe meet friday at 3", "Ana", creds);
    expect(result).toMatchObject({ plain: "Can we meet on Friday?", replyExpected: "yes" });
    expect(result.warnings.join(" ")).toMatch(/3/);
    expect(seen[0].parts[0].text).toContain("friday at 3");
  });

  it("say-it-for-me suggests wording only for members, and flags added meaning", async () => {
    const { a, c, circleId } = await circleWithMembers();
    const call = await startCall(a.id, circleId, "audio");
    setGeminiTransport({
      async generate(_c, req) {
        expect(req.system).toBe(LIVE_SAY_SYSTEM);
        return JSON.stringify({ text: "Sorry, I need a short break.", added_meaning: ["an apology"] });
      },
    });
    const s = await suggestSay(a.id, call.id, "need break", creds);
    expect(s).toEqual({ text: "Sorry, I need a short break.", flags: ["an apology"] });
    await expect(suggestSay(c.id, call.id, "need break", creds)).rejects.toSatisfy(isCode("not_found"));
  });
});
