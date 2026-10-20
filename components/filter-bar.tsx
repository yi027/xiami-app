import Link from "next/link";
import { CATEGORIES, STATUS_LABEL, STATUSES } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FilterBar({
  action,
  q,
  status,
  category,
  from,
  to,
  showQuery,
}: {
  action: string;
  q?: string;
  status?: string;
  category?: string;
  from?: string;
  to?: string;
  showQuery?: boolean;
}) {
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-line bg-card/80 p-4 md:grid-cols-6">
      {showQuery ? (
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="q">搜尋</Label>
          <Input id="q" name="q" defaultValue={q} placeholder="標題、描述、人員" />
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="status">狀態</Label>
        <NativeSelect id="status" name="status" defaultValue={status || ""}>
          <option value="">全部</option>
          {STATUSES.map((item) => (
            <option key={item} value={item}>
              {STATUS_LABEL[item]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="category">類別</Label>
        <NativeSelect id="category" name="category" defaultValue={category || ""}>
          <option value="">全部</option>
          {CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="from">從</Label>
        <Input id="from" name="from" type="date" defaultValue={from} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="to">到</Label>
        <Input id="to" name="to" type="date" defaultValue={to} />
      </div>
      <div className="flex items-end gap-2 md:col-span-6">
        <Button type="submit" variant="outline">
          套用
        </Button>
        <Button variant="ghost" asChild>
          <Link href={action}>清除</Link>
        </Button>
      </div>
    </form>
  );
}
