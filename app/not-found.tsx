import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-6 py-16">
      <p className="seal">謎</p>
      <h1 className="mt-6 font-serif text-3xl">找不到這一頁</h1>
      <p className="mt-2 text-muted">也許事件已經刪除，或網址寫錯了。</p>
      <Link href="/" className="mt-6 text-sm font-medium text-seal">
        回事件列表
      </Link>
    </main>
  );
}
