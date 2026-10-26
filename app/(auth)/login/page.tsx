import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { CATEGORIES, firstParam, safeNextPath } from "@/lib/domain";
import { LoginForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "登入" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-sm text-muted">打開登入頁…</p>}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextPath = safeNextPath(firstParam(params.next) || "/");
  return (
    <AuthScreen
      title="登入"
      lede="用你的電子郵件進來。自己建立的事件預設只有你看得到；分享給好友後，對方可以一起留下紀錄。"
    >
      <LoginForm nextPath={nextPath} />
      <aside className="mt-6 rounded-2xl bg-[#f6efe6] px-4 py-3 text-sm leading-6 text-[#5c5148]">
        <p className="font-medium text-foreground">示範帳號</p>
        <p>demo@xiami.app</p>
        <p>密碼 xiami-demo</p>
      </aside>
    </AuthScreen>
  );
}

export function AuthScreen({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto grid min-h-full max-w-5xl items-center gap-8 px-4 py-8 md:grid-cols-2 md:px-6 md:py-12">
      <section className="rounded-3xl bg-[#9d2c2c] px-6 py-8 text-[#fff6ee] md:min-h-[32rem] md:px-8 md:py-10">
        <p className="inline-grid h-12 w-12 place-items-center rounded-lg bg-[#fff6ee] font-serif text-2xl text-[#9d2c2c] shadow-[2px_2px_0_#6d1d1d]">
          謎
        </p>
        <h1 className="mt-8 font-serif text-4xl tracking-wide">瞎謎</h1>
        <p className="mt-3 max-w-sm text-base leading-7 text-[#f8e4d8]">
          把生活裡的事一筆筆記下來。開始、執行、結案。
        </p>
        <ul className="mt-8 flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <li
              key={category.id}
              className="rounded-full px-3 py-1 text-sm font-medium"
              style={{ background: category.bg, color: category.ink }}
            >
              {category.label}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-3xl border border-line bg-card p-6 shadow-sm md:p-8">
        <h2 className="font-serif text-3xl">{title}</h2>
        <p className="mt-2 mb-6 text-sm leading-6 text-muted">{lede}</p>
        {children}
      </section>
    </main>
  );
}
