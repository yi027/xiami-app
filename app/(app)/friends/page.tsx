import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { FriendsBoard } from "@/components/friends-board";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linkPendingInvites, listFriendViews } from "@/lib/friends";

export const metadata: Metadata = { title: "好友" };

export default function FriendsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">打開好友名單…</p>}>
      <Friends />
    </Suspense>
  );
}

async function Friends() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await linkPendingInvites(prisma, user.id, user.email);
  const friends = await listFriendViews(prisma, user.id, user.email);
  return (
    <div className="space-y-5" data-testid="friends-page">
      <div>
        <p className="text-sm text-muted">{user.name}</p>
        <h1 className="font-serif text-3xl">好友</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          好友是有帳號的人。接受邀請之後，你才能把自己建立的事件分享給對方。移除好友不會取消已經分享的事件，請到該事件裡調整參與者。
        </p>
      </div>
      <FriendsBoard friends={friends} />
    </div>
  );
}
