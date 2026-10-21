import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MEDIA_LIMITS } from "@/lib/media";
import { getStorage } from "@/lib/storage";
import { addTimelineEntry } from "@/lib/timeline";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = MEDIA_LIMITS.maxVideoBytes + MEDIA_LIMITS.maxImageBytes * 3 + 1024 * 256;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "無法從這個來源上傳" }, { status: 403 });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "上傳內容超過大小限制" }, { status: 413 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const { id } = await context.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "無法讀取上傳內容" }, { status: 400 });
  }

  const body = form.get("body");
  const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  const incoming = [];
  for (const file of files) {
    if (file.size > MEDIA_LIMITS.maxVideoBytes) {
      return NextResponse.json({ error: "影片請小於 50 MB（MP4、WebM）" }, { status: 400 });
    }
    incoming.push({
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  }

  try {
    const result = await addTimelineEntry(prisma, getStorage(), user.id, id, {
      body: typeof body === "string" ? body : "",
      files: incoming,
    });
    if (!result.ok) {
      const status = result.error === "找不到這筆事件" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    revalidatePath(`/events/${id}`);
    return NextResponse.json({ ok: true, id: result.entryId });
  } catch (error) {
    console.error("新增紀錄失敗", error);
    return NextResponse.json({ error: "沒有寫入紀錄，請稍後再試" }, { status: 500 });
  }
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
