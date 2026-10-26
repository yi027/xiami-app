import { afterAll, describe, expect, it } from "vitest";
import { peopleToStorage } from "../lib/domain";
import {
  advanceEvent,
  createEvent,
  deleteOwnedEvent,
  getOwnedEvent,
  listOwnedEvents,
  updateEvent,
} from "../lib/events";
import { makeUser, prisma } from "./helpers";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("per-user events and closing email", () => {
  it("hides other users' events and logs the close email without SMTP", async () => {
    const owner = await makeUser("本人");
    const stranger = await makeUser("他人");
    const created = await createEvent(prisma, owner.id, {
      title: "加班計程車",
      description: "末班車沒了",
      category: "work",
      amountCents: 42000,
      occurredAt: new Date("2026-10-18T15:00:00.000Z"),
      people: ["同事"],
    });
    await prisma.event.create({
      data: {
        userId: stranger.id,
        title: "別人的晚餐",
        description: "不該出現",
        status: "doing",
        category: "food",
        amountCents: 100,
        occurredAt: new Date("2026-10-18T12:00:00.000Z"),
        people: peopleToStorage(["秘密"]),
      },
    });

    const visible = await listOwnedEvents(prisma, owner.id);
    expect(visible.map((event) => event.title)).toEqual(["加班計程車"]);
    expect(await getOwnedEvent(prisma, stranger.id, created.id)).toBeNull();
    expect(await updateEvent(prisma, stranger.id, created.id, {
      title: "被改掉",
      description: "",
      category: "food",
      amountCents: 1,
      occurredAt: new Date(),
      people: [],
    })).toBeNull();
    expect(await deleteOwnedEvent(prisma, stranger.id, created.id)).toBe(false);
    expect((await advanceEvent(prisma, stranger.id, created.id)).ok).toBe(false);

    expect((await advanceEvent(prisma, owner.id, created.id)).ok).toBe(true);
    const lines: string[] = [];
    const closed = await advanceEvent(prisma, owner.id, created.id, {
      env: {},
      logger: (line) => lines.push(line),
      now: new Date("2026-10-19T02:00:00.000Z"),
    });
    expect(closed).toMatchObject({ ok: true, email: "log", recipients: [owner.email] });
    expect(lines.join("\n")).toContain("未設定 SMTP");
    expect(lines.join("\n")).toContain("加班計程車");
    expect(lines.join("\n")).toContain("同事");

    const stored = await prisma.event.findFirstOrThrow({ where: { id: created.id } });
    expect(stored.status).toBe("closed");
    expect(stored.emailDelivery).toBe("log");
    expect(stored.emailAudience).toBe("self");
    expect(stored.closedAt?.toISOString()).toBe("2026-10-19T02:00:00.000Z");
    expect(stored.userId).toBe(owner.id);
    expect((await advanceEvent(prisma, owner.id, created.id)).ok).toBe(false);
  });
});
