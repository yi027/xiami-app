import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { centsToInput, dateToTaipeiInput } from "@/lib/domain";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnedEvent } from "@/lib/events";
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
  const event = await getOwnedEvent(prisma, user.id, id);
  if (!event) notFound();
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
