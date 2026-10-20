import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { categoryById, formatTwd, matchesFilter, parseEventFilter, summarize } from "@/lib/domain";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listOwnedEvents } from "@/lib/events";
import { FilterBar } from "@/components/filter-bar";

export const metadata: Metadata = { title: "統計" };

export default function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">計算金額…</p>}>
      <Stats searchParams={searchParams} />
    </Suspense>
  );
}

async function Stats({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const { filter, fromText, toText } = parseEventFilter(params);
  const events = (await listOwnedEvents(prisma, user.id)).filter((event) => matchesFilter(event, filter));
  const summary = summarize(events);
  const max = Math.max(...summary.byCategory.map((row) => row.amountCents), 0);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">依發生時間</p>
        <h1 className="font-serif text-3xl">統計</h1>
      </div>
      <FilterBar
        action="/stats"
        status={filter.status}
        category={filter.category}
        from={fromText}
        to={toText}
      />
      <section className="rounded-3xl border border-line bg-card p-6">
        <p className="text-sm text-muted">合計金額</p>
        <p className="mt-1 font-serif text-4xl tabular-nums md:text-5xl">{formatTwd(summary.amountCents)}</p>
        <p className="mt-2 text-sm text-muted">{summary.count} 筆事件</p>
        {summary.amountCents > 0 ? (
          <div className="mt-5 flex h-3 overflow-hidden rounded-full" aria-hidden>
            {summary.byCategory.map((row) => {
              const category = categoryById(row.category);
              if (row.amountCents <= 0) return null;
              return (
                <div
                  key={row.category}
                  style={{ width: `${(row.amountCents / summary.amountCents) * 100}%`, background: category?.bar }}
                />
              );
            })}
          </div>
        ) : null}
      </section>
      {summary.count === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-10 text-center text-sm text-muted">
          這個條件下沒有事件。
        </p>
      ) : (
        <ul className="space-y-4 rounded-3xl border border-line bg-card p-5">
          {summary.byCategory.map((row) => {
            const category = categoryById(row.category);
            const width = max === 0 ? 0 : Math.round((row.amountCents / max) * 100);
            return (
              <li key={row.category}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="rounded-md px-2 py-0.5 text-xs font-medium text-white"
                      style={{ background: category?.bar }}
                    >
                      {row.label}
                    </span>
                    <span className="text-muted">{row.count} 筆</span>
                  </span>
                  <span className="tabular-nums">{formatTwd(row.amountCents)}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[#f3eee6]" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${width}%`, background: category?.bar }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
