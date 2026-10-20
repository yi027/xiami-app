"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction, registerAction, type ActionState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={nextPath} />
      {state?.error ? <Alert>{state.error}</Alert> : null}
      <div className="space-y-2">
        <Label htmlFor="email">電子郵件</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密碼</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "登入中…" : "登入"}
      </Button>
      <p className="text-sm text-muted">
        還沒有帳號？{" "}
        <Link href="/register" className="font-medium text-seal underline-offset-4 hover:underline">
          註冊
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(registerAction, null);
  return (
    <form action={action} className="space-y-4">
      {state?.error ? <Alert>{state.error}</Alert> : null}
      <div className="space-y-2">
        <Label htmlFor="name">怎麼稱呼你</Label>
        <Input id="name" name="name" autoComplete="name" maxLength={40} placeholder="可留空" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">電子郵件</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密碼</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="至少 8 個字元"
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "建立中…" : "建立帳號"}
      </Button>
      <p className="text-sm text-muted">
        已經有帳號？{" "}
        <Link href="/login" className="font-medium text-seal underline-offset-4 hover:underline">
          登入
        </Link>
      </p>
    </form>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-[#fde8e4] px-3 py-2 text-sm text-[#7d2424]" role="alert">
      {children}
    </p>
  );
}
