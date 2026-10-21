import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { setEventParticipants } from "../lib/access";
import { advanceEvent, createEvent } from "../lib/events";
import { inviteFriend, respondToInvite } from "../lib/friends";
import { createStorage } from "../lib/storage";
import { addTimelineEntry } from "../lib/timeline";
import { PNG, makeUser, prisma } from "./helpers";

const dir = mkdtempSync(path.join(tmpdir(), "xiami-close-"));
const storage = createStorage({ driver: "local", dir });

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("close email recipients", () => {
  it("emails only the owner, or the whole participant group, with the timeline", async () => {
    const owner = await makeUser("結案人");
    const friend = await makeUser("同伴");
    const invited = await inviteFriend(prisma, owner.id, friend.email, { env: {}, logger: () => undefined });
    if (!invited.ok) throw new Error(invited.error);
    expect((await respondToInvite(prisma, friend.id, friend.email, invited.friendshipId, "accepted")).ok).toBe(true);

    const privateEvent = await createEvent(prisma, owner.id, {
      title: "只給自己的結案",
      description: "自己看",
      category: "work",
      amountCents: 100,
      occurredAt: new Date("2026-10-18T01:00:00.000Z"),
      people: [],
    });
    expect((await advanceEvent(prisma, owner.id, privateEvent.id)).ok).toBe(true);
    expect((await setEventParticipants(prisma, owner.id, privateEvent.id, [friend.id])).ok).toBe(true);
    const selfLines: string[] = [];
    const self = await advanceEvent(prisma, owner.id, privateEvent.id, {
      env: {},
      audience: "self",
      logger: (line) => selfLines.push(line),
      appUrl: "http://app.test",
    });
    expect(self).toMatchObject({ ok: true, email: "log", recipients: [owner.email] });
    const selfLog = selfLines.join("\n");
    expect(selfLog).toContain(`To: ${owner.email}`);
    expect(selfLog).not.toContain(`To: ${friend.email}`);
    expect(selfLog).toContain("這封信只寄給建立者。");

    const shared = await createEvent(prisma, owner.id, {
      title: "一起結案",
      description: "附時間軸",
      category: "food",
      amountCents: 8800,
      occurredAt: new Date("2026-10-18T02:00:00.000Z"),
      people: ["阿凱"],
    });
    expect((await setEventParticipants(prisma, owner.id, shared.id, [friend.id])).ok).toBe(true);
    expect((await advanceEvent(prisma, owner.id, shared.id)).ok).toBe(true);
    const added = await addTimelineEntry(prisma, storage, friend.id, shared.id, {
      body: "結案前的照片",
      files: [{ name: "桌面.png", type: "image/png", bytes: PNG }],
    });
    expect(added.ok).toBe(true);
    const groupLines: string[] = [];
    const group = await advanceEvent(prisma, owner.id, shared.id, {
      env: {},
      audience: "group",
      logger: (line) => groupLines.push(line),
      appUrl: "http://app.test",
      now: new Date("2026-10-19T03:00:00.000Z"),
    });
    expect(group).toMatchObject({ ok: true, email: "log" });
    if (!group.ok) return;
    expect(group.recipients.sort()).toEqual([friend.email, owner.email].sort());
    const groupLog = groupLines.join("\n");
    expect(groupLog).toContain(`To: ${owner.email}`);
    expect(groupLog).toContain(`To: ${friend.email}`);
    expect(groupLog).toContain("這封信寄給事件的建立者與參與者。");
    expect(groupLog).toContain("結案前的照片");
    expect(groupLog).toContain("桌面.png");
    expect(groupLog).toContain("http://app.test/api/attachments/");
    const stored = await prisma.event.findUniqueOrThrow({ where: { id: shared.id } });
    expect(stored.emailAudience).toBe("group");
    expect(stored.status).toBe("closed");
  });
});
