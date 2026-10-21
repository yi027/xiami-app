"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABEL, nextStatus, type CloseAudience, type EmailDelivery, type Status } from "@/lib/domain";
import { advanceEventAction, deleteEventAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function StatusControls({
  id,
  status,
  emailDelivery,
  emailError,
  emailAudience,
  canManage,
  participants,
}: {
  id: string;
  status: Status;
  emailDelivery: EmailDelivery | null;
  emailError: string | null;
  emailAudience: CloseAudience | null;
  canManage: boolean;
  participants: { name: string; email: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = nextStatus(status);

  function runAdvance() {
    setError(null);
    startTransition(async () => {
      const result = await advanceEventAction(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function confirmClose(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await advanceEventAction(id, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setCloseOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {(["start", "doing", "closed"] as const).map((step, index) => {
          const reached = (["start", "doing", "closed"] as const).indexOf(status) >= index;
          return (
            <li key={step} className="flex items-center gap-2">
              <span
                className={
                  reached
                    ? "rounded-full bg-white px-3 py-1 font-medium text-foreground"
                    : "rounded-full px-3 py-1 text-muted"
                }
              >
                {STATUS_LABEL[step]}
              </span>
              {index < 2 ? <span className="text-muted">→</span> : null}
            </li>
          );
        })}
      </ol>
      {status === "closed" ? <EmailNote delivery={emailDelivery} error={emailError} audience={emailAudience} /> : null}
      {error ? (
        <p className="text-sm text-[#7d2424]" role="alert">
          {error}
        </p>
      ) : null}
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {next === "doing" ? (
            <Button type="button" onClick={runAdvance} disabled={pending}>
              {pending ? "更新中…" : "推進到執行"}
            </Button>
          ) : null}
          {next === "closed" ? (
            <Button type="button" onClick={() => setCloseOpen(true)} disabled={pending} data-testid="close-event">
              結案並留下紀錄
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)} disabled={pending}>
            刪除
          </Button>
        </div>
      ) : (
        <p className="text-sm text-[#4d433c]">只有建立者可以推進狀態、結案、刪除或調整參與者。你可以在下面留下紀錄。</p>
      )}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent data-testid="close-dialog">
          <DialogTitle>結案這筆事件？</DialogTitle>
          <DialogDescription>
            結案信會附上摘要、時間軸與附件連結。若還沒設定 SMTP，內容會寫進伺服器日誌，事件仍會結案。
          </DialogDescription>
          <form action={confirmClose} className="mt-4 space-y-4">
            <fieldset className="space-y-2" data-testid="close-audience">
              <legend className="text-sm font-medium">寄給誰</legend>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="audience" value="self" defaultChecked className="mt-1" data-testid="audience-self" />
                <span>只寄給我自己</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="audience"
                  value="group"
                  className="mt-1"
                  disabled={participants.length === 0}
                  data-testid="audience-group"
                />
                <span>
                  寄給我與所有參與者
                  {participants.length === 0
                    ? "（還沒有參與者）"
                    : `（${participants.map((person) => person.name).join("、")}）`}
                </span>
              </label>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCloseOpen(false)}>
                先不要
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "結案中…" : "確認結案"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogTitle>刪除這筆事件？</DialogTitle>
          <DialogDescription>刪掉之後不會留在統計裡，參與者與時間軸也會一併移除，不能復原。</DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <form action={deleteEventAction.bind(null, id)}>
              <Button type="submit" variant="destructive">
                刪除
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmailNote({
  delivery,
  error,
  audience,
}: {
  delivery: EmailDelivery | null;
  error: string | null;
  audience: CloseAudience | null;
}) {
  const who = audience === "group" ? "你與參與者" : "你";
  if (delivery === "smtp") {
    return <p className="rounded-xl bg-white/80 px-3 py-2 text-sm">結案摘要已寄給{who}。</p>;
  }
  if (delivery === "log") {
    return (
      <p className="rounded-xl bg-white/80 px-3 py-2 text-sm">
        尚未設定 SMTP，結案摘要（收件者：{who}）已寫入伺服器日誌，沒有實際寄出。
      </p>
    );
  }
  if (delivery === "failed") {
    return (
      <p className="rounded-xl bg-[#fde8e4] px-3 py-2 text-sm text-[#7d2424]">
        事件已結案，但寄信失敗{error ? `：${error}` : ""}。摘要已另外寫入伺服器日誌。
      </p>
    );
  }
  return null;
}
