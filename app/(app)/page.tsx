import { Suspense } from "react";
import Link from "next/link";
import {
  CATEGORIES,
  categoryById,
  formatTaipeiShort,
  formatTwd,
  matchesFilter,
  parseEventFilter,
  STATUS_LABEL,
  type EventRecord,
} from "@/lib/domain";
import { listSharedEvents } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listOwnedEvents } from "@/lib/events";
import { FilterBar } from "@/components/filter-bar";
import { redirect } from "next/navigation";

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">整理事件…</p>}>
      <EventHome searchParams={searchParams} />
    </Suspense>
  );
}

async function EventHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const { filter, fromText, toText, q } = parseEventFilter(params);
  const events = (await listOwnedEvents(prisma, user.id)).filter((event) => matchesFilter(event, filter));
  const shared = (await listSharedEvents(prisma, user.id)).filter((event) => matchesFilter(event, filter));
  const filtered = Boolean(q || filter.status || filter.category || filter.from || filter.to);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{user.name}的紀事</p>
          <h1 className="font-serif text-3xl">事件</h1>
        </div>
        <p className="text-sm text-muted">{events.length + shared.length} 筆</p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="類別顏色">
        {CATEGORIES.map((category) => (
          <li
            key={category.id}
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: category.bg, color: category.ink }}
          >
            {category.label}
          </li>
        ))}
      </ul>
      <FilterBar
        action="/"
        showQuery
        q={q}
        status={filter.status}
        category={filter.category}
        from={fromText}
        to={toText}
      />
      {events.length === 0 && shared.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-16 text-center">
          <h2 className="font-serif text-2xl">{filtered ? "沒有符合條件的事件" : "還沒有事件"}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
            {filtered ? "放寬日期、狀態或關鍵字再看一次。" : "從一筆小事開始。吃了什麼、付了什麼、誰一起在場。"}
          </p>
          {!filtered ? (
            <Link href="/events/new" className="mt-6 inline-flex rounded-full bg-seal px-4 py-2 text-sm text-seal-ink">
              記下一筆
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          <EventList title="我的事件" events={events} empty="你建立的事件沒有符合這個條件。" />
          {shared.length > 0 ? (
            <EventList
              title="與我分享"
              events={shared.map((event) => ({ ...event, note: `${event.ownerName}分享` }))}
              empty=""
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function EventList({
  title,
  events,
  empty,
}: {
  title: string;
  events: Array<EventRecord & { note?: string }>;
  empty: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl">{title}</h2>
      {events.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="grid gap-3">
          {events.map((event) => {
            const category = categoryById(event.category);
            return (
              <li key={event.id}>
                <Link
                  href={`/events/${event.id}`}
                  className="grid gap-3 rounded-2xl border px-4 py-4 shadow-sm transition hover:-translate-y-0.5 md:grid-cols-[auto_1fr_auto] md:items-center"
                  style={{ background: category?.bg, borderColor: category?.bar }}
                >
                  <span
                    className="grid h-11 min-w-11 place-items-center rounded-xl px-2 text-sm font-semibold text-white"
                    style={{ background: category?.bar }}
                  >
                    {category?.label}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium">{event.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#4d433c]">
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs">{STATUS_LABEL[event.status]}</span>
                      <span>{formatTaipeiShort(event.occurredAt)}</span>
                      {event.note ? <span>{event.note}</span> : null}
                      {event.people.length > 0 ? <span className="truncate">{event.people.join("、")}</span> : null}
                    </span>
                  </span>
                  <span className="text-base font-medium tabular-nums md:text-right">{formatTwd(event.amountCents)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
