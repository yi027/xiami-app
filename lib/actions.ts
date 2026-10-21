"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setEventParticipants } from "@/lib/access";
import { clearSessionCookie, getCurrentUser, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isValidEmail, normalizeEmail, parseEventForm, safeNextPath, validatePassword, type CloseAudience } from "@/lib/domain";
import { advanceEvent, createEvent, deleteOwnedEvent, updateEvent } from "@/lib/events";
import { inviteFriend, linkPendingInvites, removeFriendship, respondToInvite } from "@/lib/friends";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getStorage } from "@/lib/storage";

export type ActionState = { error?: string; notice?: string } | null;

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
  await linkPendingInvites(prisma, user.id, user.email);
  await setSessionCookie(user.id);
  redirect(next);
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = normalizeEmail(field(formData, "email"));
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
  await linkPendingInvites(prisma, user.id, user.email);
  const pending = await prisma.friendship.count({ where: { inviteeEmail: user.email, status: "pending" } });
  await setSessionCookie(user.id);
  redirect(pending > 0 ? "/friends" : "/");
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

export async function deleteEventAction(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const files = await prisma.attachment.findMany({
    where: { entry: { eventId: id, event: { userId: user.id } } },
    select: { storageKey: true },
  });
  const removed = await deleteOwnedEvent(prisma, user.id, id);
  if (removed && files.length > 0) {
    try {
      const storage = getStorage();
      await Promise.all(files.map((file) => storage.delete(file.storageKey).catch(() => undefined)));
    } catch (error) {
      console.error("刪除附件檔案失敗", error);
    }
  }
  touchEventPaths();
  redirect("/");
}

export async function advanceEventAction(id: string, formData?: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const audience: CloseAudience = formData && field(formData, "audience") === "group" ? "group" : "self";
  const result = await advanceEvent(prisma, user.id, id, { audience });
  if (!result.ok) return { error: result.error };
  touchEventPaths(id);
  return null;
}

export async function inviteFriendAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const result = await inviteFriend(prisma, user.id, field(formData, "email"));
  if (!result.ok) return { error: result.error };
  revalidatePath("/friends");
  return { notice: "邀請已送出。若尚未設定 SMTP，信件內容會寫進伺服器日誌。" };
}

export async function friendDecisionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = field(formData, "id");
  const decision = field(formData, "decision");
  const result =
    decision === "accepted" || decision === "declined"
      ? await respondToInvite(prisma, user.id, user.email, id, decision)
      : decision === "remove" || decision === "cancel"
        ? await removeFriendship(prisma, user.id, user.email, id)
        : { ok: false as const, error: "無法處理這個操作" };
  if (!result.ok) return { error: result.error };
  revalidatePath("/friends");
  return null;
}

export async function setParticipantsAction(eventId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const ids = formData.getAll("friendId").filter((value): value is string => typeof value === "string");
  const result = await setEventParticipants(prisma, user.id, eventId, ids);
  if (!result.ok) return { error: result.error };
  touchEventPaths(eventId);
  return { notice: "已更新參與者" };
}
