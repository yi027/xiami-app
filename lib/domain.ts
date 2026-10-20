export const CATEGORIES = [
  { id: "food", label: "食", hint: "飲食", bg: "#F6D7BE", ink: "#6B3414", bar: "#C4622D" },
  { id: "clothing", label: "衣", hint: "衣著", bg: "#F6D0DA", ink: "#7A2440", bar: "#C45373" },
  { id: "housing", label: "住", hint: "居住", bg: "#CDE7E1", ink: "#0F5C4C", bar: "#1F8A72" },
  { id: "transport", label: "行", hint: "交通", bg: "#D3E0F6", ink: "#1C3F86", bar: "#3A6BC4" },
  { id: "education", label: "育", hint: "教育", bg: "#E2D4F4", ink: "#542A86", bar: "#7A45B5" },
  { id: "leisure", label: "樂", hint: "休閒", bg: "#D7EEC9", ink: "#24561A", bar: "#4C8C38" },
  { id: "work", label: "工作", hint: "工作", bg: "#EADCC8", ink: "#5C3B16", bar: "#A56B32" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const STATUSES = ["start", "doing", "closed"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  start: "開始",
  doing: "執行",
  closed: "結案",
};

export type EmailDelivery = "log" | "smtp" | "failed";

export type EventRecord = {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: Status;
  category: CategoryId;
  amountCents: number;
  occurredAt: Date;
  people: string[];
  closedAt: Date | null;
  emailDelivery: EmailDelivery | null;
  emailError: string | null;
};

export type EventFilter = {
  q?: string;
  status?: Status;
  category?: CategoryId;
  from?: Date;
  to?: Date;
};

export type EventInput = {
  title: string;
  description: string;
  category: CategoryId;
  amountCents: number;
  occurredAt: Date;
  people: string[];
};

const TAIPEI = "Asia/Taipei";

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

export function isCategory(value: string): value is CategoryId {
  return CATEGORIES.some((category) => category.id === value);
}

export function categoryById(id: string) {
  return CATEGORIES.find((category) => category.id === id) ?? null;
}

export function nextStatus(current: Status): Status | null {
  if (current === "start") return "doing";
  if (current === "doing") return "closed";
  return null;
}

export function canTransition(from: Status, to: Status): boolean {
  return nextStatus(from) === to;
}

export function parsePeople(raw: string): string[] {
  const parts = raw
    .split(/[\n,，、]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const name of parts) {
    if (name.length > 40) throw new Error("相關人員姓名請在 40 字以內");
    if (!unique.includes(name)) unique.push(name);
  }
  if (unique.length > 20) throw new Error("相關人員最多 20 人");
  return unique;
}

export function peopleToStorage(people: string[]): string {
  return JSON.stringify(people);
}

export function peopleFromStorage(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function yuanToCents(input: string): number {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("金額請填 0 以上的數字，最多兩位小數");
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (whole.length > 10) throw new Error("金額超出可記錄範圍");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("金額超出可記錄範圍");
  return cents;
}

export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const frac = abs % 100;
  if (frac === 0) return `${sign}${yuan}`;
  return `${sign}${yuan}.${String(frac).padStart(2, "0")}`;
}

export function formatTwd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100).toLocaleString("zh-TW");
  const frac = abs % 100;
  if (frac === 0) return `${sign}NT$${yuan}`;
  return `${sign}NT$${yuan}.${String(frac).padStart(2, "0")}`;
}

export function taipeiLocalToDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("發生時間格式不正確");
  }
  const date = new Date(`${value}:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error("發生時間不正確");
  return date;
}

export function dateToTaipeiInput(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

export function formatTaipei(date: Date): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TAIPEI,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatTaipeiShort(date: Date): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TAIPEI,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function taipeiDayStart(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error("日期格式不正確");
  return new Date(`${dateStr}T00:00:00+08:00`);
}

export function taipeiDayEnd(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error("日期格式不正確");
  return new Date(`${dateStr}T23:59:59.999+08:00`);
}

export function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function parseEventFilter(input: {
  q?: string | string[];
  status?: string | string[];
  category?: string | string[];
  from?: string | string[];
  to?: string | string[];
}): { filter: EventFilter; fromText: string; toText: string; q: string } {
  const q = firstParam(input.q).trim();
  const statusRaw = firstParam(input.status);
  const categoryRaw = firstParam(input.category);
  const fromText = firstParam(input.from);
  const toText = firstParam(input.to);
  const filter: EventFilter = {};
  if (q) filter.q = q;
  if (isStatus(statusRaw)) filter.status = statusRaw;
  if (isCategory(categoryRaw)) filter.category = categoryRaw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromText)) filter.from = taipeiDayStart(fromText);
  if (/^\d{4}-\d{2}-\d{2}$/.test(toText)) filter.to = taipeiDayEnd(toText);
  return { filter, fromText, toText, q };
}

export function matchesFilter(event: EventRecord, filter: EventFilter): boolean {
  if (filter.status && event.status !== filter.status) return false;
  if (filter.category && event.category !== filter.category) return false;
  if (filter.from && event.occurredAt < filter.from) return false;
  if (filter.to && event.occurredAt > filter.to) return false;
  if (filter.q) {
    const haystack = [event.title, event.description, ...event.people].join("\n").toLowerCase();
    if (!haystack.includes(filter.q.trim().toLowerCase())) return false;
  }
  return true;
}

export type CategoryTotal = {
  category: CategoryId;
  label: string;
  amountCents: number;
  count: number;
};

export function summarize(events: EventRecord[], filter: EventFilter = {}) {
  const matched = events.filter((event) => matchesFilter(event, filter));
  const byCategory: CategoryTotal[] = CATEGORIES.map((category) => {
    const rows = matched.filter((event) => event.category === category.id);
    return {
      category: category.id,
      label: category.label,
      amountCents: rows.reduce((sum, event) => sum + event.amountCents, 0),
      count: rows.length,
    };
  });
  return {
    count: matched.length,
    amountCents: matched.reduce((sum, event) => sum + event.amountCents, 0),
    byCategory,
  };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 120;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "密碼至少 8 個字元";
  if (password.length > 72) return "密碼請勿超過 72 個字元";
  return null;
}

export function parseEventForm(input: {
  title: string;
  description: string;
  category: string;
  amount: string;
  occurredAt: string;
  people: string;
}): { ok: true; value: EventInput } | { ok: false; error: string } {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "請填寫標題" };
  if (title.length > 80) return { ok: false, error: "標題請在 80 字以內" };
  const description = input.description.trim();
  if (description.length > 4000) return { ok: false, error: "描述請在 4000 字以內" };
  if (!isCategory(input.category)) return { ok: false, error: "請選擇類別" };
  try {
    return {
      ok: true,
      value: {
        title,
        description,
        category: input.category,
        amountCents: yuanToCents(input.amount.trim() === "" ? "0" : input.amount),
        occurredAt: taipeiLocalToDate(input.occurredAt),
        people: parsePeople(input.people),
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "資料不正確" };
  }
}

export function safeNextPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("://")) {
    return "/";
  }
  return value;
}

export function ownedWhere(userId: string, id?: string) {
  return id ? { id, userId } : { userId };
}

export type CloseEmailInput = {
  title: string;
  description: string;
  categoryLabel: string;
  people: string[];
  occurredAt: Date;
  amountCents: number;
  closedAt: Date;
  to: string;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildCloseEmail(input: CloseEmailInput) {
  const people = input.people.length > 0 ? input.people.join("、") : "（無）";
  const description = input.description.trim() || "（無）";
  const amount = formatTwd(input.amountCents);
  const occurred = formatTaipei(input.occurredAt);
  const closed = formatTaipei(input.closedAt);
  const subject = `【瞎謎】事件已結案：${input.title.replace(/[\r\n]/g, " ")}`;
  const text = [
    "這封信是瞎謎-APP 在事件結案時自動寄出的紀錄。",
    "",
    `標題：${input.title}`,
    `類別：${input.categoryLabel}`,
    "狀態：結案",
    `金額：${amount}`,
    `發生時間：${occurred}`,
    `結案時間：${closed}`,
    `相關人員：${people}`,
    "",
    "描述：",
    description,
  ].join("\n");
  const row = (label: string, value: string) =>
    `<tr><th align="left" style="padding:6px 12px 6px 0;color:#6f645b;font-weight:500;">${label}</th><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`;
  const html = `<div style="font-family:'Noto Sans TC',sans-serif;color:#241c17;line-height:1.6;">
<p>這封信是瞎謎-APP 在事件結案時自動寄出的紀錄。</p>
<table style="border-collapse:collapse;">
${row("標題", input.title)}
${row("類別", input.categoryLabel)}
${row("狀態", "結案")}
${row("金額", amount)}
${row("發生時間", occurred)}
${row("結案時間", closed)}
${row("相關人員", people)}
</table>
<p style="margin-bottom:4px;">描述：</p>
<p style="white-space:pre-wrap;">${escapeHtml(description)}</p>
</div>`;
  return { to: input.to, subject, text, html };
}

export type EventRow = {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: string;
  category: string;
  amountCents: number;
  occurredAt: Date;
  people: string;
  closedAt: Date | null;
  emailDelivery: string | null;
  emailError: string | null;
};

export function toEventRecord(row: EventRow): EventRecord | null {
  if (!isStatus(row.status) || !isCategory(row.category)) return null;
  const emailDelivery =
    row.emailDelivery === "log" || row.emailDelivery === "smtp" || row.emailDelivery === "failed"
      ? row.emailDelivery
      : null;
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description,
    status: row.status,
    category: row.category,
    amountCents: row.amountCents,
    occurredAt: row.occurredAt,
    people: peopleFromStorage(row.people),
    closedAt: row.closedAt,
    emailDelivery,
    emailError: row.emailError,
  };
}
