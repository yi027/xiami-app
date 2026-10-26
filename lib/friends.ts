import type { PrismaClient } from "@prisma/client";
import { appBaseUrl, buildInviteEmail, isValidEmail, normalizeEmail } from "@/lib/domain";
import { deliverEmail } from "@/lib/email";

type Db = PrismaClient;

export type FriendStatus = "pending" | "accepted" | "declined";

export type FriendView = {
  id: string;
  status: Exclude<FriendStatus, "declined">;
  direction: "incoming" | "outgoing";
  email: string;
  name: string | null;
  userId: string | null;
};

const rank: Record<FriendView["status"], number> = { accepted: 2, pending: 1 };

export function dedupeFriends(views: FriendView[]) {
  const map = new Map<string, FriendView>();
  for (const view of views) {
    const key = view.userId ?? view.email;
    const current = map.get(key);
    if (!current || rank[view.status] > rank[current.status]) map.set(key, view);
  }
  return [...map.values()];
}

export async function listFriendViews(db: Db, userId: string, email: string): Promise<FriendView[]> {
  const normalized = normalizeEmail(email);
  const rows = await db.friendship.findMany({
    where: {
      status: { in: ["pending", "accepted"] },
      OR: [{ requesterId: userId }, { addresseeId: userId }, { inviteeEmail: normalized }],
    },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      addressee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  const views: FriendView[] = [];
  for (const row of rows) {
    if (row.status !== "pending" && row.status !== "accepted") continue;
    const outgoing = row.requesterId === userId;
    if (!outgoing && row.addresseeId !== userId && row.inviteeEmail !== normalized) continue;
    const other = outgoing ? row.addressee : row.requester;
    views.push({
      id: row.id,
      status: row.status,
      direction: outgoing ? "outgoing" : "incoming",
      email: outgoing ? row.inviteeEmail : row.requester.email,
      name: other?.name ?? null,
      userId: other?.id ?? null,
    });
  }
  return dedupeFriends(views);
}

export async function listAcceptedFriends(db: Db, userId: string, email: string) {
  const views = await listFriendViews(db, userId, email);
  return views.filter((view): view is FriendView & { userId: string } => view.status === "accepted" && Boolean(view.userId));
}

export async function linkPendingInvites(db: Db, userId: string, email: string) {
  await db.friendship.updateMany({
    where: { inviteeEmail: normalizeEmail(email), addresseeId: null },
    data: { addresseeId: userId },
  });
}

export async function inviteFriend(
  db: Db,
  requesterId: string,
  rawEmail: string,
  options: { env?: NodeJS.ProcessEnv; logger?: (line: string) => void } = {},
): Promise<{ ok: true; friendshipId: string; email: "log" | "smtp" | "failed" } | { ok: false; error: string }> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return { ok: false, error: "請輸入有效的電子郵件" };
  const requester = await db.user.findUnique({ where: { id: requesterId }, select: { id: true, email: true, name: true } });
  if (!requester) return { ok: false, error: "請先登入" };
  if (requester.email === email) return { ok: false, error: "不能加自己為好友" };

  const invitee = await db.user.findUnique({ where: { email }, select: { id: true } });
  const outgoing = await db.friendship.findUnique({
    where: { requesterId_inviteeEmail: { requesterId, inviteeEmail: email } },
  });
  const incoming = await db.friendship.findFirst({
    where: {
      inviteeEmail: requester.email,
      status: { in: ["pending", "accepted"] },
      requester: { email },
    },
  });
  if (outgoing?.status === "accepted" || incoming?.status === "accepted") {
    return { ok: false, error: "你們已經是好友" };
  }
  if (incoming?.status === "pending") {
    return { ok: false, error: "對方已經邀請你了，請到好友頁接受" };
  }
  if (outgoing?.status === "pending") {
    return { ok: false, error: "邀請已寄出，等待對方回覆" };
  }

  const row = outgoing
    ? await db.friendship.update({
        where: { id: outgoing.id },
        data: { status: "pending", addresseeId: invitee?.id ?? null },
      })
    : await db.friendship.create({
        data: {
          requesterId,
          addresseeId: invitee?.id ?? null,
          inviteeEmail: email,
          status: "pending",
        },
      });

  const env = options.env ?? process.env;
  const message = buildInviteEmail({
    to: email,
    fromName: requester.name,
    fromEmail: requester.email,
    appUrl: appBaseUrl(env),
  });
  const logger = options.logger ?? console.log;
  let mode: "log" | "smtp" | "failed" = "log";
  try {
    const result = await deliverEmail(message, env, logger);
    mode = result.mode;
  } catch (error) {
    mode = "failed";
    const reason = error instanceof Error ? error.message : "寄信失敗";
    logger(`瞎謎寄信失敗：${reason}\n${message.text}`);
  }
  return { ok: true, friendshipId: row.id, email: mode };
}

export async function respondToInvite(
  db: Db,
  userId: string,
  email: string,
  friendshipId: string,
  decision: "accepted" | "declined",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = normalizeEmail(email);
  const row = await db.friendship.findFirst({
    where: {
      id: friendshipId,
      status: "pending",
      OR: [{ addresseeId: userId }, { inviteeEmail: normalized }],
    },
    include: { requester: { select: { id: true, email: true } } },
  });
  if (!row || row.requesterId === userId) return { ok: false, error: "找不到這份邀請" };
  await db.$transaction(async (tx) => {
    await tx.friendship.update({
      where: { id: row.id },
      data: { status: decision, addresseeId: userId },
    });
    if (decision === "accepted") {
      await tx.friendship.updateMany({
        where: { requesterId: userId, inviteeEmail: row.requester.email, status: "pending" },
        data: { status: "accepted", addresseeId: row.requesterId },
      });
    }
  });
  return { ok: true };
}

export async function removeFriendship(
  db: Db,
  userId: string,
  email: string,
  friendshipId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = normalizeEmail(email);
  const row = await db.friendship.findUnique({
    where: { id: friendshipId },
    include: { requester: { select: { email: true } } },
  });
  if (!row) return { ok: false, error: "找不到這筆好友資料" };
  const isRequester = row.requesterId === userId;
  const isAddressee = row.addresseeId === userId || row.inviteeEmail === normalized;
  if (!isRequester && !isAddressee) return { ok: false, error: "找不到這筆好友資料" };
  if (row.status === "pending" && !isRequester) return { ok: false, error: "請接受或婉拒這份邀請" };
  if (row.status === "declined") return { ok: false, error: "這份邀請已經結束" };
  const otherEmail = isRequester ? row.inviteeEmail : row.requester.email;
  await db.friendship.deleteMany({
    where: {
      OR: [
        { requesterId: row.requesterId, inviteeEmail: row.inviteeEmail },
        { requesterId: userId, inviteeEmail: otherEmail },
        { requesterId: isRequester ? undefined : row.requesterId, inviteeEmail: normalized },
      ].filter((item) => item.requesterId),
    },
  });
  return { ok: true };
}
