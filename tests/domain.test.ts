import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  buildCloseEmail,
  buildInviteEmail,
  canTransition,
  closeRecipientEmails,
  centsToInput,
  formatTwd,
  matchesFilter,
  nextStatus,
  parseEventForm,
  parsePeople,
  safeNextPath,
  summarize,
  taipeiLocalToDate,
  yuanToCents,
  type EventRecord,
} from "../lib/domain";

function sample(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "1",
    userId: "user-a",
    title: "巷口早餐",
    description: "蛋餅",
    status: "start",
    category: "food",
    amountCents: 8500,
    occurredAt: new Date("2026-10-01T00:30:00.000Z"),
    people: ["阿凱"],
    closedAt: null,
    emailDelivery: null,
    emailError: null,
    emailAudience: null,
    ...overrides,
  };
}

describe("status lifecycle", () => {
  it("only moves 開始 → 執行 → 結案", () => {
    expect(nextStatus("start")).toBe("doing");
    expect(nextStatus("doing")).toBe("closed");
    expect(nextStatus("closed")).toBeNull();
    expect(canTransition("start", "doing")).toBe(true);
    expect(canTransition("start", "closed")).toBe(false);
    expect(canTransition("closed", "doing")).toBe(false);
  });
});

describe("categories", () => {
  it("gives every category a distinct background and bar colour", () => {
    expect(new Set(CATEGORIES.map((category) => category.bg)).size).toBe(CATEGORIES.length);
    expect(new Set(CATEGORIES.map((category) => category.bar)).size).toBe(CATEGORIES.length);
    expect(CATEGORIES.map((category) => category.label)).toEqual(["食", "衣", "住", "行", "育", "樂", "工作"]);
  });
});

describe("money and people", () => {
  it("converts yuan to cents without binary drift", () => {
    expect(yuanToCents("1,280.5")).toBe(128050);
    expect(yuanToCents("10")).toBe(1000);
    expect(centsToInput(128050)).toBe("1280.50");
    expect(formatTwd(68000)).toBe("NT$680");
    expect(() => yuanToCents("-1")).toThrow();
  });

  it("parses related people", () => {
    expect(parsePeople("阿凱、小滿, 媽媽")).toEqual(["阿凱", "小滿", "媽媽"]);
    expect(parsePeople("阿凱\n阿凱")).toEqual(["阿凱"]);
  });
});

describe("filters and stats", () => {
  const events = [
    sample(),
    sample({
      id: "2",
      title: "房租",
      category: "housing",
      status: "closed",
      amountCents: 1800000,
      occurredAt: new Date("2026-09-01T01:00:00.000Z"),
      people: ["陳房東"],
    }),
    sample({
      id: "3",
      userId: "user-b",
      title: "別人的晚餐",
      amountCents: 99900,
    }),
  ];

  it("filters by status, category, date, and text", () => {
    expect(events.filter((event) => matchesFilter(event, { status: "closed" })).map((event) => event.id)).toEqual(["2"]);
    expect(events.filter((event) => matchesFilter(event, { category: "food" }))).toHaveLength(2);
    expect(
      events.filter((event) =>
        matchesFilter(event, {
          from: new Date("2026-09-15T00:00:00.000Z"),
          to: new Date("2026-10-31T16:00:00.000Z"),
        }),
      ),
    ).toHaveLength(2);
    expect(events.filter((event) => matchesFilter(event, { q: "陳房東" })).map((event) => event.id)).toEqual(["2"]);
  });

  it("sums amounts per category and overall", () => {
    const owned = events.filter((event) => event.userId === "user-a");
    const summary = summarize(owned, { status: "closed" });
    expect(summary.count).toBe(1);
    expect(summary.amountCents).toBe(1800000);
    expect(summary.byCategory.find((row) => row.category === "housing")?.amountCents).toBe(1800000);
    expect(summary.byCategory.find((row) => row.category === "food")?.amountCents).toBe(0);
  });
});

describe("forms and email", () => {
  it("rejects a blank title and builds a close summary", () => {
    expect(parseEventForm({
      title: "  ",
      description: "",
      category: "food",
      amount: "10",
      occurredAt: "2026-10-20T08:30",
      people: "",
    }).ok).toBe(false);

    const occurredAt = taipeiLocalToDate("2026-10-20T08:30");
    const message = buildCloseEmail({
      to: "demo@xiami.app",
      title: "<早餐>",
      description: "蛋餅",
      categoryLabel: "食",
      people: ["阿凱"],
      occurredAt,
      amountCents: 8500,
      closedAt: occurredAt,
    });
    expect(message.to).toBe("demo@xiami.app");
    expect(message.subject).toContain("【瞎謎】事件已結案");
    expect(message.text).toContain("NT$85");
    expect(message.text).toContain("阿凱");
    expect(message.html).toContain("&lt;早餐&gt;");
    expect(message.html).not.toContain("<早餐>");
    expect(message.text).toContain("時間軸：");
    expect(message.text).toContain("這封信只寄給建立者。");
  });

  it("chooses close-email recipients and escapes the timeline", () => {
    expect(closeRecipientEmails("self", "Owner@Xiami.app", ["friend@xiami.app"])).toEqual(["owner@xiami.app"]);
    expect(closeRecipientEmails("group", "owner@xiami.app", ["friend@xiami.app", "owner@xiami.app"])).toEqual([
      "owner@xiami.app",
      "friend@xiami.app",
    ]);
    const occurredAt = taipeiLocalToDate("2026-10-20T08:30");
    const message = buildCloseEmail({
      to: "friend@xiami.app",
      title: "分享的晚餐",
      description: "一起吃",
      categoryLabel: "食",
      people: [],
      occurredAt,
      amountCents: 1000,
      closedAt: occurredAt,
      audience: "group",
      timeline: [
        {
          authorName: "朋友",
          createdAt: occurredAt,
          body: "<script>alert(1)</script>",
          attachments: [{ fileName: "照片.png", url: "http://app.test/api/attachments/a1" }],
        },
      ],
    });
    expect(message.text).toContain("這封信寄給事件的建立者與參與者。");
    expect(message.text).toContain("http://app.test/api/attachments/a1");
    expect(message.text).toContain("照片.png");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).not.toContain("<script>");
  });

  it("builds a friend invitation", () => {
    const message = buildInviteEmail({
      to: "new@xiami.app",
      fromName: "林可恩",
      fromEmail: "demo@xiami.app",
      appUrl: "http://app.test",
    });
    expect(message.to).toBe("new@xiami.app");
    expect(message.text).toContain("http://app.test/register");
    expect(message.text).toContain("http://app.test/friends");
    expect(message.subject).toContain("林可恩");
  });

  it("blocks open redirects", () => {
    expect(safeNextPath("/stats")).toBe("/stats");
    expect(safeNextPath("https://evil.test")).toBe("/");
    expect(safeNextPath("//evil.test")).toBe("/");
  });
});
