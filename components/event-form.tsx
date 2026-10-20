"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CATEGORIES } from "@/lib/domain";
import { createEventAction, updateEventAction, type ActionState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PeopleField } from "@/components/people-field";

export type EventFormValues = {
  title: string;
  description: string;
  category: string;
  amount: string;
  occurredAt: string;
  people: string[];
};

export function EventForm({
  mode,
  eventId,
  defaults,
}: {
  mode: "create" | "edit";
  eventId?: string;
  defaults: EventFormValues;
}) {
  const action =
    mode === "create" ? createEventAction : updateEventAction.bind(null, eventId ?? "");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);

  return (
    <form action={formAction} className="space-y-5 rounded-3xl border border-line bg-card p-5 shadow-sm md:p-7">
      {state?.error ? (
        <p className="rounded-xl bg-[#fde8e4] px-3 py-2 text-sm text-[#7d2424]" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="title">標題</Label>
        <Input id="title" name="title" required maxLength={80} defaultValue={defaults.title} placeholder="這件事叫什麼" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">描述</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={4000}
          defaultValue={defaults.description}
          placeholder="發生了什麼、後來怎麼了"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">類別</Label>
          <NativeSelect id="category" name="category" defaultValue={defaults.category} required>
            {CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label} · {category.hint}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="amount">金額（元）</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            defaultValue={defaults.amount}
            placeholder="0"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="occurredAt">發生時間</Label>
          <Input
            id="occurredAt"
            name="occurredAt"
            type="datetime-local"
            required
            defaultValue={defaults.occurredAt}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>相關人員</Label>
        <PeopleField defaultPeople={defaults.people} />
      </div>
      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={pending}>
          {pending ? "儲存中…" : mode === "create" ? "建立事件" : "儲存修改"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={mode === "edit" && eventId ? `/events/${eventId}` : "/"}>取消</Link>
        </Button>
      </div>
    </form>
  );
}
