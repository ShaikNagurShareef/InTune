import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { createInvite } from "@/lib/services/invites";
import { getCircle, leaveCircle, listCircles } from "@/lib/services/circles";
import { listContacts, openDirect } from "@/lib/services/direct";
import { listMessages } from "@/lib/services/messages";
import { blockUser } from "@/lib/services/moderation";
import { publishMessage } from "@/lib/services/publish";
import { circleWithMembers, freshDb } from "./helpers";

const isCode = (code: string) => (e: unknown) => e instanceof AppError && e.code === code;
let n = 0;
const send = (userId: string, circleId: string, text: string) =>
  publishMessage(userId, { circleId, text, replyToId: null, idempotencyKey: `dm-key-${++n}-xxxx`, draftId: null, approvalId: null });

describe("direct chats", () => {
  beforeEach(freshDb);

  it("only people who share a circle can start a direct chat", async () => {
    const { a, b, c } = await circleWithMembers();
    expect((await listContacts(a.id)).map((x) => x.displayName)).toEqual(["Ben"]);
    await expect(openDirect(a.id, c.id)).rejects.toSatisfy(isCode("not_found"));
    await expect(openDirect(a.id, b.id)).resolves.toBeTruthy();
  });

  it("each pair has exactly one conversation, whoever opens it", async () => {
    const { a, b } = await circleWithMembers();
    const first = await openDirect(a.id, b.id);
    const second = await openDirect(b.id, a.id);
    expect(second.id).toBe(first.id);
  });

  it("is private to the two people and titled with the other person's name", async () => {
    const { a, b, c } = await circleWithMembers();
    const { id } = await openDirect(a.id, b.id);
    await send(a.id, id, "just us");
    expect((await getCircle(a.id, id)).name).toBe("Ben");
    expect((await getCircle(b.id, id)).name).toBe("Ana");
    await expect(listMessages(c.id, id, null)).rejects.toSatisfy(isCode("not_found"));
  });

  it("appears in the chat list with a preview and unread count, newest first", async () => {
    const { a, b } = await circleWithMembers();
    const { id } = await openDirect(a.id, b.id);
    await send(a.id, id, "hello Ben");
    const [top] = await listCircles(b.id);
    expect(top).toMatchObject({ id, kind: "direct", name: "Ana", unread: 1, last: { text: "hello Ben", mine: false } });
  });

  it("blocking either way stops new chats and sending, and hides the chat for the blocker", async () => {
    const { a, b } = await circleWithMembers();
    const { id } = await openDirect(a.id, b.id);
    await blockUser(b.id, a.id);
    await expect(send(a.id, id, "hi?")).rejects.toSatisfy(isCode("forbidden"));
    await expect(openDirect(a.id, b.id)).rejects.toSatisfy(isCode("not_found"));
    expect((await listCircles(b.id)).some((x) => x.id === id)).toBe(false);
  });

  it("has no invitations and can't be left", async () => {
    const { a, b } = await circleWithMembers();
    const { id } = await openDirect(a.id, b.id);
    await expect(createInvite(a.id, id, null)).rejects.toSatisfy(isCode("forbidden"));
    await expect(leaveCircle(a.id, id)).rejects.toSatisfy(isCode("conflict"));
  });
});
