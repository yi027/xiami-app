import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dateToTaipeiInput, peopleToStorage, taipeiLocalToDate } from "../lib/domain";
import { hashPassword } from "../lib/password";

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function atDaysAgo(days: number, hour: number, minute: number) {
  const today = dateToTaipeiInput(new Date()).slice(0, 10);
  const base = taipeiLocalToDate(
    `${today}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  );
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
}

async function main() {
  loadEnv();
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const demoHash = await hashPassword("xiami-demo");
  const otherHash = await hashPassword("other-demo");

  const demo = await prisma.user.upsert({
    where: { email: "demo@xiami.app" },
    update: { name: "林可恩", passwordHash: demoHash },
    create: { email: "demo@xiami.app", name: "林可恩", passwordHash: demoHash },
  });
  const other = await prisma.user.upsert({
    where: { email: "other@xiami.app" },
    update: { name: "另一個人", passwordHash: otherHash },
    create: { email: "other@xiami.app", name: "另一個人", passwordHash: otherHash },
  });

  if ((await prisma.event.count({ where: { userId: demo.id } })) === 0) {
    await prisma.event.createMany({
      data: [
        {
          userId: demo.id,
          title: "週末市集午餐",
          description: "河濱市集的炒麵，阿凱付了一半。",
          status: "start",
          category: "food",
          amountCents: 68000,
          occurredAt: atDaysAgo(1, 12, 30),
          people: peopleToStorage(["阿凱", "小滿"]),
        },
        {
          userId: demo.id,
          title: "換季薄外套",
          description: "深藍色，袖口有點長，還在考慮要不要改。",
          status: "doing",
          category: "clothing",
          amountCents: 248000,
          occurredAt: atDaysAgo(3, 15, 10),
          people: peopleToStorage(["店員小周"]),
        },
        {
          userId: demo.id,
          title: "十月房租",
          description: "已轉帳，含管理費。",
          status: "doing",
          category: "housing",
          amountCents: 1800000,
          occurredAt: atDaysAgo(5, 9, 0),
          people: peopleToStorage(["陳房東"]),
        },
        {
          userId: demo.id,
          title: "高鐵回高雄",
          description: "對號座，和媽媽一起回去看阿公。",
          status: "closed",
          category: "transport",
          amountCents: 149000,
          occurredAt: atDaysAgo(12, 9, 40),
          people: peopleToStorage(["媽媽"]),
          closedAt: atDaysAgo(11, 21, 5),
          emailDelivery: "log",
        },
        {
          userId: demo.id,
          title: "日文聽力課",
          description: "六週小班，每週三晚上。",
          status: "start",
          category: "education",
          amountCents: 320000,
          occurredAt: atDaysAgo(2, 19, 30),
          people: peopleToStorage([]),
        },
        {
          userId: demo.id,
          title: "演唱會門票",
          description: "站區。還沒決定怎麼去。",
          status: "doing",
          category: "leisure",
          amountCents: 280000,
          occurredAt: atDaysAgo(8, 20, 0),
          people: peopleToStorage(["阿凱"]),
        },
        {
          userId: demo.id,
          title: "加班計程車",
          description: "末班捷運沒了，從公司直接回家。",
          status: "closed",
          category: "work",
          amountCents: 42000,
          occurredAt: atDaysAgo(4, 23, 20),
          people: peopleToStorage([]),
          closedAt: atDaysAgo(4, 23, 40),
          emailDelivery: "log",
        },
        {
          userId: demo.id,
          title: "巷口早餐",
          description: "蛋餅加豆漿。",
          status: "closed",
          category: "food",
          amountCents: 8500,
          occurredAt: atDaysAgo(0, 8, 10),
          people: peopleToStorage([]),
          closedAt: atDaysAgo(0, 8, 25),
          emailDelivery: "log",
        },
        {
          userId: demo.id,
          title: "二手書桌",
          description: "還在等賣家約運送。",
          status: "start",
          category: "housing",
          amountCents: 560000,
          occurredAt: atDaysAgo(6, 11, 15),
          people: peopleToStorage(["賣家阿德"]),
        },
        {
          userId: demo.id,
          title: "通勤月票",
          description: "這個月的捷運月票。",
          status: "doing",
          category: "transport",
          amountCents: 128000,
          occurredAt: atDaysAgo(9, 7, 50),
          people: peopleToStorage([]),
        },
      ],
    });
  }

  if ((await prisma.event.count({ where: { userId: other.id } })) === 0) {
    await prisma.event.create({
      data: {
        userId: other.id,
        title: "別人的晚餐",
        description: "這筆只屬於另一個帳號。",
        status: "start",
        category: "food",
        amountCents: 99900,
        occurredAt: atDaysAgo(1, 18, 0),
        people: peopleToStorage(["不該被看見"]),
      },
    });
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
