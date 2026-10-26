import { afterAll, describe, expect, it } from "vitest";
import { inviteFriend, linkPendingInvites, listAcceptedFriends, listFriendViews, removeFriendship, respondToInvite } from "../lib/friends";
import { makeUser, prisma } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("friends by email", () => {
  it("invites an address without an account, then shows the invite after registration", async () => {
    const owner = await makeUser("邀請人");
    const email = `newcomer.${Date.now()}@test.app`;
    const lines: string[] = [];
    const invited = await inviteFriend(prisma, owner.id, `  ${email.toUpperCase()} `, {
      env: {},
      logger: (line) => lines.push(line),
    });
    expect(invited.ok).toBe(true);
    expect(lines.join("\n")).toContain("未設定 SMTP");
    expect(lines.join("\n")).toContain(email);

    const registered = await prisma.user.create({
      data: { email, name: "新朋友", passwordHash: "x" },
    });
    await linkPendingInvites(prisma, registered.id, registered.email);
    const incoming = await listFriendViews(prisma, registered.id, registered.email);
    expect(incoming).toEqual([
      expect.objectContaining({ direction: "incoming", status: "pending", email: owner.email }),
    ]);
    expect((await respondToInvite(prisma, registered.id, registered.email, incoming[0]!.id, "accepted")).ok).toBe(true);
    expect((await listAcceptedFriends(prisma, owner.id, owner.email)).map((friend) => friend.userId)).toContain(registered.id);

    expect((await removeFriendship(prisma, owner.id, owner.email, incoming[0]!.id)).ok).toBe(true);
    expect(await listAcceptedFriends(prisma, owner.id, owner.email)).toEqual([]);
    expect(await listAcceptedFriends(prisma, registered.id, registered.email)).toEqual([]);
  });

  it("lets an existing user decline, then accepts a later invite, and rejects duplicates", async () => {
    const owner = await makeUser("主人");
    const friend = await makeUser("舊友");
    const first = await inviteFriend(prisma, owner.id, friend.email, { env: {}, logger: () => undefined });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect((await respondToInvite(prisma, friend.id, friend.email, first.friendshipId, "declined")).ok).toBe(true);
    expect(await listFriendViews(prisma, friend.id, friend.email)).toEqual([]);

    const second = await inviteFriend(prisma, owner.id, friend.email, { env: {}, logger: () => undefined });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect((await inviteFriend(prisma, owner.id, friend.email, { env: {}, logger: () => undefined })).ok).toBe(false);
    expect((await respondToInvite(prisma, friend.id, friend.email, second.friendshipId, "accepted")).ok).toBe(true);
    expect((await inviteFriend(prisma, owner.id, owner.email, { env: {}, logger: () => undefined })).ok).toBe(false);
    expect((await removeFriendship(prisma, friend.id, friend.email, second.friendshipId)).ok).toBe(true);
    expect(await listFriendViews(prisma, owner.id, owner.email)).toEqual([]);
  });
});
