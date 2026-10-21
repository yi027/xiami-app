import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { resolveEventAccess } from "@/lib/access";
import { MEDIA_LIMITS, sanitizeFileName, validateAttachment, validateRecordBody, type MediaKind } from "@/lib/media";
import { permissionsFor } from "@/lib/permissions";
import type { ObjectStorage } from "@/lib/storage";

type Db = PrismaClient;

export type IncomingFile = {
  name: string;
  type: string;
  bytes: Uint8Array;
};

export async function addTimelineEntry(
  db: Db,
  storage: ObjectStorage,
  userId: string,
  eventId: string,
  input: { body: string; files: IncomingFile[] },
): Promise<{ ok: true; entryId: string } | { ok: false; error: string }> {
  const access = await resolveEventAccess(db, userId, eventId);
  if (!access || !permissionsFor(access.access).addRecord) {
    return { ok: false, error: "找不到這筆事件" };
  }
  const body = validateRecordBody(input.body);
  if (!body.ok) return body;
  if (input.files.length > MEDIA_LIMITS.maxAttachments) {
    return { ok: false, error: "每則紀錄最多 4 個附件" };
  }
  if (!body.body && input.files.length === 0) {
    return { ok: false, error: "請寫下內容或附上檔案" };
  }

  const validated: Array<{
    bytes: Uint8Array;
    fileName: string;
    contentType: string;
    kind: MediaKind;
  }> = [];
  let videos = 0;
  for (const file of input.files) {
    const result = validateAttachment(file.bytes, file.type);
    if (!result.ok) return result;
    if (result.kind === "video") videos += 1;
    validated.push({
      bytes: file.bytes,
      fileName: sanitizeFileName(file.name, result.contentType),
      contentType: result.contentType,
      kind: result.kind,
    });
  }
  if (videos > MEDIA_LIMITS.maxVideos) return { ok: false, error: "每則紀錄最多 1 部影片" };

  const entry = await db.timelineEntry.create({
    data: { eventId, authorId: userId, body: body.body },
  });
  const stored: string[] = [];
  try {
    for (const file of validated) {
      const id = randomUUID();
      const key = `events/${eventId}/${entry.id}/${id}`;
      await storage.put(key, file.bytes);
      stored.push(key);
      await db.attachment.create({
        data: {
          id,
          entryId: entry.id,
          storageKey: key,
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.bytes.byteLength,
          kind: file.kind,
        },
      });
    }
  } catch (error) {
    await Promise.all(stored.map((key) => storage.delete(key).catch(() => undefined)));
    await db.timelineEntry.delete({ where: { id: entry.id } }).catch(() => undefined);
    throw error;
  }
  return { ok: true, entryId: entry.id };
}
