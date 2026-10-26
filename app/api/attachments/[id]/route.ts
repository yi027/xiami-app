import { NextResponse } from "next/server";
import { getAttachmentForUser } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStorage, parseByteRange } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    const accept = request.headers.get("accept") ?? "";
    if (accept.includes("text/html")) {
      const next = new URL(request.url).pathname;
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));
    }
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  const { id } = await context.params;
  const attachment = await getAttachmentForUser(prisma, user.id, id);
  if (!attachment) return NextResponse.json({ error: "找不到檔案" }, { status: 404 });

  let storage;
  try {
    storage = getStorage();
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "檔案儲存尚未設定" }, { status: 500 });
  }

  const total = await storage.size(attachment.storageKey);
  if (total === null) return NextResponse.json({ error: "找不到檔案" }, { status: 404 });
  const range = parseByteRange(request.headers.get("range"), total);
  if (range === "invalid") {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }
  const stored = await storage.get(attachment.storageKey, range ?? undefined);
  if (!stored) return NextResponse.json({ error: "找不到檔案" }, { status: 404 });

  const headers = new Headers({
    "Content-Type": attachment.contentType,
    "Content-Length": String(stored.body.byteLength),
    "Accept-Ranges": "bytes",
    "Content-Disposition": contentDisposition(attachment.fileName),
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  if (range) {
    headers.set("Content-Range", `bytes ${stored.start}-${stored.end}/${stored.total}`);
    return new NextResponse(Buffer.from(stored.body), { status: 206, headers });
  }
  return new NextResponse(Buffer.from(stored.body), { status: 200, headers });
}

function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
