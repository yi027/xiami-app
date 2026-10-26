import { afterAll, describe, expect, it } from "vitest";
import { getVisibleEvent, setEventParticipants } from "../lib/access";
import { permissionsFor } from "../lib/permissions";
import { createEvent, deleteOwnedEvent, updateEvent, advanceEvent } from "../lib/events";
import { inviteFriend, respondToInvite } from "../lib/friends";
import { createStorage } from "../lib/storage";
import { addTimelineEntry } from "../lib/timeline";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { makeUser, prisma } from "./helpers";

const dir = mkdtempSync(path.join(tmpdir(), "xiami-perm-"));
const storage = createStorage({ driver: "local", dir });

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("event permissions", () => {
  it("describes owner, participant, and outsider capabilities", () => {
    expect(permissionsFor("none")).toEqual({
      view: false,
      addRecord: false,
      editCore: false,
      delete: false,
      manageParticipants: false,
      changeStatus: false,
    });
    expect(permissionsFor("participant")).toMatchObject({
      view: true,
      addRecord: true,
      editCore: false,
      delete: false,
      manageParticipants: false,
      changeStatus: false,
    });
    expect(permissionsFor("owner").delete).toBe(true);
    expect(permissionsFor("owner").editCore).toBe(true);
  });

  it("blocks outsiders and stops participants from editing or deleting", async () => {
    const owner = await makeUser("建立者");
    const friend = await makeUser("參與者");
    const stranger = await makeUser("路人");
    const invited = await inviteFriend(prisma, owner.id, friend.email, { env: {}, logger: () => undefined });
    expect(invited.ok).toBe(true);
    if (!invited.ok) return;
    expect((await respondToInvite(prisma, friend.id, friend.email, invited.friendshipId, "accepted")).ok).toBe(true);

    const created = await createEvent(prisma, owner.id, {
      title: "一起的晚餐",
      description: "還沒分享",
      category: "food",
      amountCents: 50000,
      occurredAt: new Date("2026-10-18T12:00:00.000Z"),
      people: ["店員"],
    });

    expect(await getVisibleEvent(prisma, stranger.id, created.id)).toBeNull();
    expect(await updateEvent(prisma, stranger.id, created.id, blank("被改掉"))).toBeNull();
    expect(await deleteOwnedEvent(prisma, stranger.id, created.id)).toBe(false);
    expect((await advanceEvent(prisma, stranger.id, created.id)).ok).toBe(false);
    expect((await addTimelineEntry(prisma, storage, stranger.id, created.id, { body: "偷看", files: [] })).ok).toBe(false);
    expect(await setEventParticipants(prisma, stranger.id, created.id, [friend.id])).toMatchObject({ ok: false });

    expect((await setEventParticipants(prisma, owner.id, created.id, [stranger.id])).ok).toBe(false);
    expect((await setEventParticipants(prisma, owner.id, created.id, [friend.id])).ok).toBe(true);

    const visible = await getVisibleEvent(prisma, friend.id, created.id);
    expect(visible?.access).toBe("participant");
    expect(await updateEvent(prisma, friend.id, created.id, blank("參與者改標題"))).toBeNull();
    expect(await deleteOwnedEvent(prisma, friend.id, created.id)).toBe(false);
    expect((await advanceEvent(prisma, friend.id, created.id)).ok).toBe(false);
    expect((await setEventParticipants(prisma, friend.id, created.id, [])).ok).toBe(false);
    expect((await addTimelineEntry(prisma, storage, friend.id, created.id, { body: "我到了", files: [] })).ok).toBe(true);

    const stored = await prisma.event.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.title).toBe("一起的晚餐");
    expect(stored.userId).toBe(owner.id);
    expect(await prisma.timelineEntry.count({ where: { eventId: created.id, body: "偷看" } })).toBe(0);
    expect(await prisma.timelineEntry.count({ where: { eventId: created.id, body: "我到了" } })).toBe(1);
  });
});

function blank(title: string) {
  return {
    title,
    description: "",
    category: "food" as const,
    amountCents: 1,
    occurredAt: new Date(),
    people: [],
  };
}
