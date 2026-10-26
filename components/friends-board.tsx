"use client";

import { Children, useActionState, type ReactNode } from "react";
import { friendDecisionAction, inviteFriendAction, type ActionState } from "@/lib/actions";
import type { FriendView } from "@/lib/friends";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FriendsBoard({ friends }: { friends: FriendView[] }) {
  const incoming = friends.filter((friend) => friend.direction === "incoming" && friend.status === "pending");
  const outgoing = friends.filter((friend) => friend.direction === "outgoing" && friend.status === "pending");
  const accepted = friends.filter((friend) => friend.status === "accepted");

  return (
    <div className="space-y-6">
      <InviteForm />
      <FriendSection title="等你回覆" empty="沒有待回覆的邀請。">
        {incoming.map((friend) => (
          <li key={friend.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
            <Person friend={friend} />
            <div className="flex gap-2">
              <DecisionForm id={friend.id} decision="accepted" label="接受" />
              <DecisionForm id={friend.id} decision="declined" label="婉拒" variant="outline" />
            </div>
          </li>
        ))}
      </FriendSection>
      <FriendSection title="已送出的邀請" empty="沒有等待對方回覆的邀請。">
        {outgoing.map((friend) => (
          <li key={friend.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
            <Person friend={friend} hint="等待回覆" />
            <DecisionForm id={friend.id} decision="cancel" label="取消邀請" variant="ghost" />
          </li>
        ))}
      </FriendSection>
      <FriendSection title="好友" empty="還沒有好友。用上面的電子郵件邀請一位。">
        {accepted.map((friend) => (
          <li key={friend.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
            <Person friend={friend} />
            <DecisionForm id={friend.id} decision="remove" label="移除好友" variant="outline" />
          </li>
        ))}
      </FriendSection>
    </div>
  );
}

function InviteForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteFriendAction, null);
  return (
    <form action={action} className="space-y-3 rounded-3xl border border-line bg-card p-5 shadow-sm">
      <div>
        <h2 className="font-serif text-2xl">用電子郵件加好友</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          對方會收到邀請信。若還沒有帳號，用同一個電子郵件註冊後，就能在這裡接受或婉拒。未設定 SMTP 時，邀請只寫進伺服器日誌。
        </p>
      </div>
      {state?.error ? <Alert>{state.error}</Alert> : null}
      {state?.notice ? <p className="rounded-xl bg-[#e7f3ea] px-3 py-2 text-sm">{state.notice}</p> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Label htmlFor="friend-email" className="sr-only">
          好友電子郵件
        </Label>
        <Input id="friend-email" name="email" type="email" required placeholder="friend@example.com" autoComplete="email" />
        <Button type="submit" disabled={pending}>
          {pending ? "寄出中…" : "送出邀請"}
        </Button>
      </div>
    </form>
  );
}

function DecisionForm({
  id,
  decision,
  label,
  variant = "default",
}: {
  id: string;
  decision: "accepted" | "declined" | "remove" | "cancel";
  label: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(friendDecisionAction, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {pending ? "處理中…" : label}
      </Button>
      {state?.error ? <span className="text-xs text-[#7d2424]">{state.error}</span> : null}
    </form>
  );
}

function FriendSection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const visible = Children.toArray(children).filter(Boolean);
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-2xl">{title}</h2>
      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-6 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  );
}

function Person({ friend, hint }: { friend: FriendView; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{friend.name ?? friend.email}</p>
      <p className="truncate text-sm text-muted">
        {friend.email}
        {hint ? ` · ${hint}` : ""}
      </p>
    </div>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-[#fde8e4] px-3 py-2 text-sm text-[#7d2424]" role="alert">
      {children}
    </p>
  );
}
