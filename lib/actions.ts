"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearSessionCookie, getCurrentUser, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isValidEmail, parseEventForm, safeNextPath, validatePassword } from "@/lib/domain";
import { advanceEvent, createEvent, deleteOwnedEvent, updateEvent } from "@/lib/events";
import { hashPassword, verifyPassword } from "@/lib/password";

export type ActionState = { error: string } | null;

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function touchEventPaths(id?: string) {
  revalidatePath("/");
  revalidatePath("/stats");
  if (id) revalidatePath(`/events/${id}`);
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = field(formData, "email").trim().toLowerCase();
  const password = field(formData, "password");
  const next = safeNextPath(field(formData, "next") || "/");
  if (!isValidEmail(email) || !password) return { error: "請輸入有效的電子郵件與密碼" };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "電子郵件或密碼不正確" };
  }
  await setSessionCookie(user.id);
  redirect(next);
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = field(formData, "email").trim().toLowerCase();
  const password = field(formData, "password");
  const nameRaw = field(formData, "name").trim();
  if (!isValidEmail(email)) return { error: "請輸入有效的電子郵件" };
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  const name = nameRaw || email.split("@")[0] || "使用者";
  if (name.length > 40) return { error: "名稱請在 40 字以內" };
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "這個電子郵件已經註冊" };
  const user = await prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(password) },
  });
  await setSessionCookie(user.id);
  redirect("/");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

export async function createEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = parseEventForm({
    title: field(formData, "title"),
    description: field(formData, "description"),
    category: field(formData, "category"),
    amount: field(formData, "amount"),
    occurredAt: field(formData, "occurredAt"),
    people: field(formData, "people"),
  });
  if (!parsed.ok) return parsed;
  const event = await createEvent(prisma, user.id, parsed.value);
  touchEventPaths(event.id);
  redirect(`/events/${event.id}`);
}

export async function updateEventAction(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = parseEventForm({
    title: field(formData, "title"),
    description: field(formData, "description"),
    category: field(formData, "category"),
    amount: field(formData, "amount"),
    occurredAt: field(formData, "occurredAt"),
    people: field(formData, "people"),
  });
  if (!parsed.ok) return parsed;
  const event = await updateEvent(prisma, user.id, id, parsed.value);
  if (!event) return { error: "找不到這筆事件" };
  touchEventPaths(id);
  redirect(`/events/${id}`);
}

export async function deleteEventAction(id: string, _formData?: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deleteOwnedEvent(prisma, user.id, id);
  touchEventPaths();
  redirect("/");
}

export async function advanceEventAction(id: string): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const result = await advanceEvent(prisma, user.id, id);
  if (!result.ok) return { error: result.error };
  touchEventPaths(id);
  return null;
}
