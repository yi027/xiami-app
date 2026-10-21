import type { PrismaClient } from "@prisma/client";
import { toEventRecord, type EventRecord } from "@/lib/domain";
import { listAcceptedFriends } from "@/lib/friends";
import { permissionsFor, type EventAccess } from "@/lib/permissions";

type Db = PrismaClient;

export async function resolveEventAccess(
  db: Db,
  userId: string,
  eventId: string,
): Promise<{ access: EventAccess; eventId: string } | null> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, userId: true } });
  if (!event) return null;
  if (event.userId === userId) return { access: "owner", eventId: event.id };
  const participant = await db.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { id: true },
  });
  if (participant) return { access: "participant", eventId: event.id };
  return { access: "none", eventId: event.id };
}

export type ParticipantView = {
  userId: string;
  name: string;
  email: string;
};

export type TimelineAttachmentView = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  kind: string;
};

export type TimelineEntryView = {
  id: string;
  body: string;
  createdAt: Date;
  author: { id: string; name: string };
  attachments: TimelineAttachmentView[];
};

export type EventDetail = {
  record: EventRecord;
  access: Exclude<EventAccess, "none">;
  owner: { id: string; name: string; email: string };
  participants: ParticipantView[];
  timeline: TimelineEntryView[];
};

export async function loadEventDetail(db: Db, userId: string, eventId: string): Promise<EventDetail | null> {
  const access = await resolveEventAccess(db, userId, eventId);
  if (!access || access.access === "none" || !permissionsFor(access.access).view) return null;
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!event) return null;
  const record = toEventRecord(event);
  if (!record) return null;
  const [participants, timeline] = await Promise.all([
    db.eventParticipant.findMany({
      where: { eventId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.timelineEntry.findMany({
      where: { eventId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        author: { select: { id: true, name: true } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    }),
  ]);
  return {
    record,
    access: access.access,
    owner: event.user,
    participants: participants.map((row) => ({
      userId: row.user.id,
      name: row.user.name,
      email: row.user.email,
    })),
    timeline: timeline.map((entry) => ({
      id: entry.id,
      body: entry.body,
      createdAt: entry.createdAt,
      author: entry.author,
      attachments: entry.attachments.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        kind: file.kind,
      })),
    })),
  };
}

export async function getVisibleEvent(db: Db, userId: string, eventId: string) {
  const detail = await loadEventDetail(db, userId, eventId);
  if (!detail) return null;
  return { event: detail.record, access: detail.access };
}

export async function listSharedEvents(db: Db, userId: string): Promise<Array<EventRecord & { ownerName: string }>> {
  const rows = await db.eventParticipant.findMany({
    where: { userId },
    include: { event: { include: { user: { select: { name: true } } } } },
  });
  const events = rows.flatMap((row) => {
    const record = toEventRecord(row.event);
    if (!record) return [];
    return [{ ...record, ownerName: row.event.user.name }];
  });
  events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id));
  return events;
}

export async function setEventParticipants(
  db: Db,
  ownerId: string,
  eventId: string,
  friendUserIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const event = await db.event.findFirst({ where: { id: eventId, userId: ownerId }, select: { id: true } });
  if (!event) return { ok: false, error: "找不到這筆事件" };
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { email: true } });
  if (!owner) return { ok: false, error: "請先登入" };
  const friends = await listAcceptedFriends(db, ownerId, owner.email);
  const allowed = new Set(friends.map((friend) => friend.userId));
  const unique = [...new Set(friendUserIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.includes(ownerId)) return { ok: false, error: "不需要把自己加進參與者" };
  if (unique.some((id) => !allowed.has(id))) return { ok: false, error: "只能分享給已接受邀請的好友" };
  await db.$transaction([
    db.eventParticipant.deleteMany({ where: { eventId } }),
    ...(unique.length > 0
      ? [db.eventParticipant.createMany({ data: unique.map((userId) => ({ eventId, userId })) })]
      : []),
  ]);
  return { ok: true };
}

export async function getAttachmentForUser(db: Db, userId: string, attachmentId: string) {
  const attachment = await db.attachment.findUnique({
    where: { id: attachmentId },
    include: { entry: { select: { eventId: true } } },
  });
  if (!attachment) return null;
  const access = await resolveEventAccess(db, userId, attachment.entry.eventId);
  if (!access || !permissionsFor(access.access).view) return null;
  return attachment;
}
