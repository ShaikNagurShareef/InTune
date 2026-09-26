import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { createCircle, listCircles } from "@/lib/services/circles";
import {
  acceptInvitation,
  declineInvitation,
  inviteByEmail,
  listMyInvitations,
  listPendingInvites,
} from "@/lib/services/invites";
import { blockUser } from "@/lib/services/moderation";
import { signUp } from "@/lib/services/accounts";
import { freshDb, makeUser } from "./helpers";

const isCode = (code: string) => (e: unknown) => e instanceof AppError && e.code === code;

describe("in-app invitations by email", () => {
  beforeEach(freshDb);

  it("shows the invitation only to the addressed account, who joins in the app", async () => {
    const ana = await makeUser("Ana");
    const ben = await makeUser("Ben");
    const cy = await makeUser("Cy");
    const { id: circleId } = await createCircle(ana.id, "Dinner");
    await inviteByEmail(ana.id, circleId, ben.email);

    const [inv] = await listMyInvitations(ben);
    expect(inv).toMatchObject({ circleName: "Dinner", inviterName: "Ana", members: ["Ana"] });
    expect(await listMyInvitations(cy)).toEqual([]);
    await expect(acceptInvitation(inv.id, cy)).rejects.toSatisfy(isCode("not_found"));

    await expect(acceptInvitation(inv.id, ben)).resolves.toEqual({ circleId });
    expect((await listCircles(ben.id)).map((c) => c.name)).toContain("Dinner");
    expect(await listMyInvitations(ben)).toEqual([]);
  });

  it("declining closes it quietly", async () => {
    const ana = await makeUser("Ana");
    const ben = await makeUser("Ben");
    const { id: circleId } = await createCircle(ana.id, "Dinner");
    await inviteByEmail(ana.id, circleId, ben.email);
    const [inv] = await listMyInvitations(ben);
    await declineInvitation(inv.id, ben);
    expect(await listMyInvitations(ben)).toEqual([]);
    await expect(acceptInvitation(inv.id, ben)).rejects.toSatisfy(isCode("not_found"));
  });

  it("gives the owner the same answer for unknown, blocked or existing members (no account probing)", async () => {
    const ana = await makeUser("Ana");
    const ben = await makeUser("Ben");
    const { id: circleId } = await createCircle(ana.id, "Dinner");
    await blockUser(ben.id, ana.id);
    await expect(inviteByEmail(ana.id, circleId, "nobody@example.com")).resolves.toBeUndefined();
    await expect(inviteByEmail(ana.id, circleId, ben.email)).resolves.toBeUndefined();
    await expect(inviteByEmail(ana.id, circleId, ana.email)).resolves.toBeUndefined();
    expect(await listMyInvitations(ben)).toEqual([]);
  });

  it("re-inviting replaces the earlier pending invitation", async () => {
    const ana = await makeUser("Ana");
    const ben = await makeUser("Ben");
    const { id: circleId } = await createCircle(ana.id, "Dinner");
    await inviteByEmail(ana.id, circleId, ben.email);
    await inviteByEmail(ana.id, circleId, ben.email);
    expect(await listMyInvitations(ben)).toHaveLength(1);
    expect(await listPendingInvites(ana.id, circleId)).toHaveLength(1);
  });

  it("someone who signs up later with the invited email sees it", async () => {
    const ana = await makeUser("Ana");
    const { id: circleId } = await createCircle(ana.id, "Dinner");
    await inviteByEmail(ana.id, circleId, "later@example.com");
    const { id } = await signUp({ email: "later@example.com", password: "password123", displayName: "Lee" });
    expect(await listMyInvitations({ id, email: "later@example.com" })).toHaveLength(1);
  });

  it("only owners can invite", async () => {
    const ana = await makeUser("Ana");
    const ben = await makeUser("Ben");
    const { id: circleId } = await createCircle(ana.id, "Dinner");
    await expect(inviteByEmail(ben.id, circleId, "x@example.com")).rejects.toSatisfy(isCode("not_found"));
  });
});
