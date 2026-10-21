import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { loadEventDetail } from "@/lib/access";
import { centsToInput, dateToTaipeiInput } from "@/lib/domain";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EventForm } from "@/components/event-form";

export const metadata: Metadata = { title: "修改事件" };

export default function EditPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">載入表單…</p>}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const detail = await loadEventDetail(prisma, user.id, id);
  if (!detail) notFound();
  if (detail.access !== "owner") {
    return (
      <div className="rounded-3xl border border-line bg-card px-6 py-10">
        <h1 className="font-serif text-3xl">只有建立者可以修改</h1>
        <p className="mt-2 text-sm leading-6 text-muted">參與者可以查看事件並新增紀錄，不能改標題、金額、狀態，也不能刪除。</p>
        <Link href={`/events/${id}`} className="mt-4 inline-flex text-sm font-medium text-seal">
          回到事件
        </Link>
      </div>
    );
  }
  const event = detail.record;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted">修改內容</p>
        <h1 className="font-serif text-3xl">{event.title}</h1>
      </div>
      <EventForm
        mode="edit"
        eventId={event.id}
        defaults={{
          title: event.title,
          description: event.description,
          category: event.category,
          amount: centsToInput(event.amountCents),
          occurredAt: dateToTaipeiInput(event.occurredAt),
          people: event.people,
        }}
      />
    </div>
  );
}
