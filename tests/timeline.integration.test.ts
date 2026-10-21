import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getAttachmentForUser, loadEventDetail, setEventParticipants } from "../lib/access";
import { MEDIA_LIMITS, attachmentSizeError, validateAttachment } from "../lib/media";
import { createEvent } from "../lib/events";
import { inviteFriend, respondToInvite } from "../lib/friends";
import { createStorage } from "../lib/storage";
import { addTimelineEntry } from "../lib/timeline";
import { PNG, makeUser, prisma, tinyMp4, tinyWebm } from "./helpers";

const dir = mkdtempSync(path.join(tmpdir(), "xiami-timeline-"));
const storage = createStorage({ driver: "local", dir });

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("timeline and attachments", () => {
  it("rejects the wrong type or an oversized file", () => {
    expect(validateAttachment(Uint8Array.from([0x68, 0x65, 0x6c, 0x6c, 0x6f]), "text/plain").ok).toBe(false);
    expect(validateAttachment(PNG, "image/png")).toMatchObject({ ok: true, kind: "image", contentType: "image/png" });
    expect(validateAttachment(PNG, "image/jpeg").ok).toBe(false);
    expect(validateAttachment(tinyMp4(), "video/mp4")).toMatchObject({ ok: true, kind: "video" });
    expect(validateAttachment(tinyWebm(), "video/webm")).toMatchObject({ ok: true, kind: "video" });
    expect(attachmentSizeError("image", MEDIA_LIMITS.maxImageBytes + 1)).toMatch(/8 MB/);
    expect(attachmentSizeError("video", MEDIA_LIMITS.maxVideoBytes + 1)).toMatch(/50 MB/);
    expect(attachmentSizeError("image", 32)).toBeNull();
  });

  it("stores image and video for participants and hides them from outsiders", async () => {
    const owner = await makeUser("紀錄主人");
    const friend = await makeUser("紀錄好友");
    const stranger = await makeUser("紀錄路人");
    const invited = await inviteFriend(prisma, owner.id, friend.email, { env: {}, logger: () => undefined });
    if (!invited.ok) throw new Error(invited.error);
    expect((await respondToInvite(prisma, friend.id, friend.email, invited.friendshipId, "accepted")).ok).toBe(true);
    const event = await createEvent(prisma, owner.id, {
      title: "市集",
      description: "",
      category: "leisure",
      amountCents: 0,
      occurredAt: new Date("2026-10-18T04:00:00.000Z"),
      people: [],
    });
    expect((await setEventParticipants(prisma, owner.id, event.id, [friend.id])).ok).toBe(true);

    const note = await addTimelineEntry(prisma, storage, owner.id, event.id, {
      body: "先到現場",
      files: [],
    });
    expect(note.ok).toBe(true);
    const withFiles = await addTimelineEntry(prisma, storage, friend.id, event.id, {
      body: "<b>攤位</b>",
      files: [
        { name: "../照片.png", type: "image/png", bytes: PNG },
        { name: "現場.webm", type: "video/webm", bytes: tinyWebm() },
      ],
    });
    expect(withFiles.ok).toBe(true);
    expect((await addTimelineEntry(prisma, storage, stranger.id, event.id, { body: "不行", files: [] })).ok).toBe(false);
    expect(
      (
        await addTimelineEntry(prisma, storage, owner.id, event.id, {
          body: "",
          files: [
            { name: "a.mp4", type: "video/mp4", bytes: tinyMp4() },
            { name: "b.webm", type: "video/webm", bytes: tinyWebm() },
          ],
        })
      ).ok,
    ).toBe(false);

    const detail = await loadEventDetail(prisma, friend.id, event.id);
    expect(detail?.timeline.map((entry) => entry.body)).toEqual(["<b>攤位</b>", "先到現場"]);
    const files = detail?.timeline[0]?.attachments ?? [];
    expect(files.map((file) => file.kind).sort()).toEqual(["image", "video"]);
    expect(files.find((file) => file.kind === "image")?.fileName).toBe("照片.png");
    const image = files.find((file) => file.kind === "image");
    expect(image).toBeTruthy();
    expect(await getAttachmentForUser(prisma, stranger.id, image!.id)).toBeNull();
    expect(await getAttachmentForUser(prisma, owner.id, image!.id)).not.toBeNull();
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: image!.id } });
    const bytes = await storage.get(row.storageKey);
    expect(Buffer.from(bytes?.body ?? []).equals(Buffer.from(PNG))).toBe(true);
  });
});
