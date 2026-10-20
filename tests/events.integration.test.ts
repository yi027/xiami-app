import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { peopleToStorage } from "../lib/domain";
import {
  advanceEvent,
  createEvent,
  deleteOwnedEvent,
  getOwnedEvent,
  listOwnedEvents,
  updateEvent,
} from "../lib/events";

const dir = mkdtempSync(path.join(tmpdir(), "xiami-"));
const databaseUrl = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = databaseUrl;
process.env.AUTH_SECRET = "test-secret-not-for-production";

let prisma: PrismaClient;

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
  const { PrismaClient: Client } = await import("@prisma/client");
  prisma = new Client({ datasources: { db: { url: databaseUrl } } });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("per-user events and closing email", () => {
  it("hides other users' events and logs the close email without SMTP", async () => {
    const owner = await prisma.user.create({
      data: { email: "owner@test.app", name: "本人", passwordHash: "x" },
    });
    const stranger = await prisma.user.create({
      data: { email: "stranger@test.app", name: "他人", passwordHash: "x" },
    });
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
    expect(closed).toEqual({ ok: true, email: "log" });
    expect(lines.join("\n")).toContain("未設定 SMTP");
    expect(lines.join("\n")).toContain("加班計程車");
    expect(lines.join("\n")).toContain("同事");

    const stored = await prisma.event.findFirstOrThrow({ where: { id: created.id } });
    expect(stored.status).toBe("closed");
    expect(stored.emailDelivery).toBe("log");
    expect(stored.closedAt?.toISOString()).toBe("2026-10-19T02:00:00.000Z");
    expect(stored.userId).toBe(owner.id);
    expect((await advanceEvent(prisma, owner.id, created.id)).ok).toBe(false);
  });
});
