import type { PrismaClient } from "@prisma/client";
import {
  buildCloseEmail,
  categoryById,
  isStatus,
  nextStatus,
  peopleToStorage,
  toEventRecord,
  type EventInput,
  type EventRecord,
} from "@/lib/domain";
import { deliverEmail } from "@/lib/email";

type Db = PrismaClient;

export async function listOwnedEvents(db: Db, userId: string): Promise<EventRecord[]> {
  const rows = await db.event.findMany({
    where: { userId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.flatMap((row) => {
    const record = toEventRecord(row);
    return record ? [record] : [];
  });
}

export async function getOwnedEvent(db: Db, userId: string, id: string): Promise<EventRecord | null> {
  const row = await db.event.findFirst({ where: { id, userId } });
  return row ? toEventRecord(row) : null;
}

export async function createEvent(db: Db, userId: string, input: EventInput) {
  return db.event.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      status: "start",
      category: input.category,
      amountCents: input.amountCents,
      occurredAt: input.occurredAt,
      people: peopleToStorage(input.people),
    },
  });
}

export async function updateEvent(db: Db, userId: string, id: string, input: EventInput) {
  const existing = await db.event.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return null;
  return db.event.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description,
      category: input.category,
      amountCents: input.amountCents,
      occurredAt: input.occurredAt,
      people: peopleToStorage(input.people),
    },
  });
}

export async function deleteOwnedEvent(db: Db, userId: string, id: string) {
  const result = await db.event.deleteMany({ where: { id, userId } });
  return result.count === 1;
}

export async function advanceEvent(
  db: Db,
  userId: string,
  id: string,
  options: {
    env?: NodeJS.ProcessEnv;
    logger?: (line: string) => void;
    now?: Date;
  } = {},
): Promise<{ ok: true; email: "log" | "smtp" | "failed" | null } | { ok: false; error: string }> {
  const row = await db.event.findFirst({
    where: { id, userId },
    include: { user: { select: { email: true } } },
  });
  if (!row) return { ok: false, error: "找不到這筆事件" };
  if (!isStatus(row.status)) return { ok: false, error: "狀態不正確" };
  const next = nextStatus(row.status);
  if (!next) return { ok: false, error: "這筆事件已經結案" };

  if (next !== "closed") {
    const updated = await db.event.updateMany({
      where: { id, userId, status: row.status },
      data: { status: next },
    });
    if (updated.count !== 1) return { ok: false, error: "狀態已變更，請重新整理" };
    return { ok: true, email: null };
  }

  const category = categoryById(row.category);
  const closedAt = options.now ?? new Date();
  const record = toEventRecord(row);
  const message = buildCloseEmail({
    to: row.user.email,
    title: row.title,
    description: row.description,
    categoryLabel: category?.label ?? row.category,
    people: record?.people ?? [],
    occurredAt: row.occurredAt,
    amountCents: row.amountCents,
    closedAt,
  });
  const logger = options.logger ?? console.log;
  let email: "log" | "smtp" | "failed" = "log";
  let emailError: string | null = null;
  try {
    const result = await deliverEmail(message, options.env ?? process.env, logger);
    email = result.mode;
  } catch (error) {
    email = "failed";
    emailError = error instanceof Error ? error.message : "寄信失敗";
    logger(`瞎謎寄信失敗：${emailError}\n${message.text}`);
  }

  const updated = await db.event.updateMany({
    where: { id, userId, status: row.status },
    data: {
      status: "closed",
      closedAt,
      emailDelivery: email,
      emailError,
    },
  });
  if (updated.count !== 1) return { ok: false, error: "狀態已變更，請重新整理" };
  return { ok: true, email };
}
