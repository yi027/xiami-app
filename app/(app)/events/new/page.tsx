import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { dateToTaipeiInput } from "@/lib/domain";
import { EventForm } from "@/components/event-form";

export const metadata: Metadata = { title: "新事件" };

export default function NewEventPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">準備表單…</p>}>
      <NewEventForm />
    </Suspense>
  );
}

async function NewEventForm() {
  await connection();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted">新的一筆</p>
        <h1 className="font-serif text-3xl">記下事件</h1>
        <p className="mt-1 text-sm text-muted">新事件從「開始」起步，之後再推進到執行與結案。</p>
      </div>
      <EventForm
        mode="create"
        defaults={{
          title: "",
          description: "",
          category: "food",
          amount: "",
          occurredAt: dateToTaipeiInput(new Date()),
          people: [],
        }}
      />
    </div>
  );
}
