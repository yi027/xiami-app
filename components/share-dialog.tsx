"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setParticipantsAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type ShareFriend = {
  userId: string;
  name: string;
  email: string;
};

export function ShareDialog({
  eventId,
  friends,
  selectedIds,
}: {
  eventId: string;
  friends: ShareFriend[];
  selectedIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await setParticipantsAction(eventId, null, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} data-testid="share-button">
        管理參與者
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(100%-2rem,40rem)] overflow-y-auto" data-testid="share-dialog">
          <DialogTitle>分享給好友</DialogTitle>
          <DialogDescription>
            勾選的好友會成為這筆事件的參與者，可以查看事件並在時間軸留下紀錄。只有你能修改核心欄位、刪除事件或調整這份名單。取消勾選會移出參與者，已經留下的紀錄會保留。
          </DialogDescription>
          {error ? (
            <p className="mt-3 rounded-xl bg-[#fde8e4] px-3 py-2 text-sm text-[#7d2424]" role="alert">
              {error}
            </p>
          ) : null}
          {friends.length === 0 ? (
            <p className="mt-4 text-sm leading-6">
              還沒有可分享的好友。先到{" "}
              <Link href="/friends" className="font-medium text-seal underline-offset-4 hover:underline">
                好友頁
              </Link>{" "}
              邀請，等對方接受。
            </p>
          ) : (
            <form action={onSubmit} className="mt-4 space-y-3">
              <ul className="space-y-2">
                {friends.map((friend) => (
                  <li key={friend.userId}>
                    <label className="flex items-start gap-3 rounded-xl bg-[#f6efe6] px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        name="friendId"
                        value={friend.userId}
                        defaultChecked={selectedIds.includes(friend.userId)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block font-medium">{friend.name}</span>
                        <span className="block text-muted">{friend.email}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "儲存中…" : "儲存參與者"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
