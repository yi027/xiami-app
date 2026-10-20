import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { categoryById, formatTaipei, formatTwd, STATUS_LABEL } from "@/lib/domain";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOwnedEvent } from "@/lib/events";
import { StatusControls } from "@/components/status-controls";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "事件" };

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">打開事件…</p>}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const event = await getOwnedEvent(prisma, user.id, id);
  if (!event) notFound();
  const category = categoryById(event.category);

  return (
    <article
      className="space-y-6 rounded-3xl border p-5 shadow-sm md:p-7"
      style={{ background: category?.bg, borderColor: category?.bar }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-3">
          <p className="text-sm" style={{ color: category?.ink }}>
            {category?.label} · {category?.hint} · {STATUS_LABEL[event.status]}
          </p>
          <h1 className="font-serif text-3xl leading-tight">{event.title}</h1>
        </div>
        <p className="font-serif text-3xl tabular-nums">{formatTwd(event.amountCents)}</p>
      </div>
      <dl className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-muted">發生時間</dt>
          <dd className="mt-1">{formatTaipei(event.occurredAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">結案時間</dt>
          <dd className="mt-1">{event.closedAt ? formatTaipei(event.closedAt) : "尚未結案"}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-muted">相關人員</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            {event.people.length === 0 ? (
              <span>沒有填寫</span>
            ) : (
              event.people.map((person) => (
                <span key={person} className="rounded-full bg-white/80 px-3 py-1">
                  {person}
                </span>
              ))
            )}
          </dd>
        </div>
      </dl>
      <div>
        <h2 className="text-sm text-muted">描述</h2>
        <p className="mt-2 whitespace-pre-wrap leading-7">{event.description || "沒有描述。"}</p>
      </div>
      <StatusControls
        id={event.id}
        status={event.status}
        emailDelivery={event.emailDelivery}
        emailError={event.emailError}
      />
      {event.status === "closed" ? (
        <p className="text-sm text-[#4d433c]">已結案的內容仍可修正，不會再次寄信。</p>
      ) : null}
      <Button variant="outline" asChild>
        <Link href={`/events/${event.id}/edit`}>修改內容</Link>
      </Button>
    </article>
  );
}
