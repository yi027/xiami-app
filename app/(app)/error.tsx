"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-3xl border border-line bg-card px-6 py-12 text-center">
      <h1 className="font-serif text-2xl">這頁沒能打開</h1>
      <p className="mt-2 text-sm text-muted">先重新整理一次。若還是不行，確認資料庫有啟動。</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-full bg-seal px-4 py-2 text-sm text-seal-ink"
      >
        再試一次
      </button>
    </div>
  );
}
