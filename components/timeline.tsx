"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RecordForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/records`, {
        method: "POST",
        body: new FormData(form),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error ?? "沒有送出");
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setError("沒有送出，請稍後再試");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-line bg-card p-4" data-testid="record-form">
      {error ? (
        <p className="rounded-xl bg-[#fde8e4] px-3 py-2 text-sm text-[#7d2424]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="record-body">新紀錄</Label>
        <Textarea id="record-body" name="body" maxLength={2000} placeholder="寫下進展、交接或現場狀況" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="record-files">圖片或影片</Label>
        <input
          id="record-files"
          name="files"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
          className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
        <p className="text-xs leading-5 text-muted">
          圖片 JPEG、PNG、GIF、WebP，單檔 8 MB，最多 4 個附件。影片 MP4 或 WebM，單檔 50 MB，每則紀錄最多 1 部。可以只寫文字，或只附檔案。
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "送出中…" : "新增紀錄"}
      </Button>
    </form>
  );
}
