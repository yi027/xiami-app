import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShareDialog } from "@/components/share-dialog";
import { StatusControls } from "@/components/status-controls";
import { RecordForm } from "@/components/timeline";
import { Button } from "@/components/ui/button";
import { loadEventDetail } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { categoryById, formatTaipei, formatTwd, STATUS_LABEL } from "@/lib/domain";
import { listAcceptedFriends } from "@/lib/friends";

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
  const detail = await loadEventDetail(prisma, user.id, id);
  if (!detail) notFound();
  const { record: event, access, owner, participants, timeline } = detail;
  const category = categoryById(event.category);
  const isOwner = access === "owner";
  const friends = isOwner ? await listAcceptedFriends(prisma, user.id, user.email) : [];

  return (
    <div className="space-y-6">
      <article
        className="space-y-6 rounded-3xl border p-5 shadow-sm md:p-7"
        style={{ background: category?.bg, borderColor: category?.bar }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-3">
            <p className="text-sm" style={{ color: category?.ink }}>
              {category?.label} · {category?.hint} · {STATUS_LABEL[event.status]}
              {isOwner ? "" : ` · ${owner.name}分享`}
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
          <div>
            <dt className="text-muted">建立者</dt>
            <dd className="mt-1">{owner.name}</dd>
          </div>
          <div>
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
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm text-muted">參與者</h2>
            {isOwner ? (
              <ShareDialog
                eventId={event.id}
                friends={friends.map((friend) => ({
                  userId: friend.userId,
                  name: friend.name ?? friend.email,
                  email: friend.email,
                }))}
                selectedIds={participants.map((person) => person.userId)}
              />
            ) : null}
          </div>
          {participants.length === 0 ? (
            <p className="text-sm">還沒有分享給好友。</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {participants.map((person) => (
                <li key={person.userId} className="rounded-full bg-white/80 px-3 py-1 text-sm">
                  {person.name}
                  <span className="text-muted"> · {person.email}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs leading-5 text-[#4d433c]">
            相關人員是自由填寫的名字。參與者是已接受好友邀請、可以一起看這筆事件並留下紀錄的帳號。
          </p>
        </section>
        <StatusControls
          id={event.id}
          status={event.status}
          emailDelivery={event.emailDelivery}
          emailError={event.emailError}
          emailAudience={event.emailAudience}
          canManage={isOwner}
          participants={participants.map((person) => ({ name: person.name, email: person.email }))}
        />
        {isOwner && event.status === "closed" ? (
          <p className="text-sm text-[#4d433c]">已結案的內容仍可修正，不會再次寄信。時間軸仍可繼續新增紀錄。</p>
        ) : null}
        {isOwner ? (
          <Button variant="outline" asChild>
            <Link href={`/events/${event.id}/edit`}>修改內容</Link>
          </Button>
        ) : null}
      </article>

      <section className="space-y-4" data-testid="timeline">
        <div>
          <h2 className="font-serif text-2xl">時間軸</h2>
          <p className="mt-1 text-sm text-muted">新的紀錄在最上面。建立者與參與者都可以留下文字、圖片或影片。</p>
        </div>
        <RecordForm eventId={event.id} />
        {timeline.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center text-sm text-muted">
            還沒有紀錄。
          </p>
        ) : (
          <ol className="space-y-3">
            {timeline.map((entry) => (
              <li key={entry.id} id={`entry-${entry.id}`} className="rounded-2xl border border-line bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{entry.author.name}</span>
                  <time dateTime={entry.createdAt.toISOString()} className="text-muted">
                    {formatTaipei(entry.createdAt)}
                  </time>
                </div>
                {entry.body ? <p className="mt-2 whitespace-pre-wrap leading-7">{entry.body}</p> : null}
                {entry.attachments.length > 0 ? (
                  <div className="mt-3 grid gap-3">
                    {entry.attachments.map((file) =>
                      file.kind === "video" ? (
                        <video
                          key={file.id}
                          id={`attachment-${file.id}`}
                          src={`/api/attachments/${file.id}`}
                          controls
                          preload="metadata"
                          className="max-h-96 w-full rounded-xl bg-black"
                        >
                          <a href={`/api/attachments/${file.id}`}>{file.fileName}</a>
                        </video>
                      ) : (
                        // User uploads are authorized per request and are not passed through the image optimizer.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={file.id}
                          id={`attachment-${file.id}`}
                          src={`/api/attachments/${file.id}`}
                          alt={file.fileName}
                          className="max-h-96 rounded-xl object-contain"
                        />
                      ),
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
