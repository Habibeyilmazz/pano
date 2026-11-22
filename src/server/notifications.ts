import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema as s, type Tx } from "@/db";
import { today } from "@/lib/dates";
import { parse } from "./account";
import { visibleProjectIds, type Ctx } from "./ctx";

export type NotificationType = "assigned" | "mentioned" | "due_tomorrow";

export async function notify(tx: Tx, ctx: Ctx, userIds: string[], type: NotificationType, taskId: string) {
  const to = [...new Set(userIds)].filter((id) => id !== ctx.userId);
  if (!to.length) return;
  await tx
    .insert(s.notifications)
    .values(to.map((userId) => ({ workspaceId: ctx.workspaceId, userId, type, taskId, actorId: ctx.userId })));
}

/** Due-tomorrow reminders are created lazily when the user looks, so no scheduler is needed. */
async function createDueReminders(ctx: Ctx) {
  const db = await getDb();
  const tomorrow = today(1);
  const due = await db
    .select({ id: s.tasks.id })
    .from(s.tasks)
    .innerJoin(s.taskAssignees, eq(s.taskAssignees.taskId, s.tasks.id))
    .innerJoin(s.columns, eq(s.columns.id, s.tasks.columnId))
    .where(
      and(
        eq(s.tasks.workspaceId, ctx.workspaceId),
        eq(s.taskAssignees.userId, ctx.userId),
        eq(s.tasks.dueDate, tomorrow),
        ne(s.columns.category, "done"),
      ),
    );
  if (!due.length) return;
  await db
    .insert(s.notifications)
    .values(
      due.map((t) => ({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        type: "due_tomorrow",
        taskId: t.id,
        dedupeKey: `due:${ctx.userId}:${t.id}:${tomorrow}`,
      })),
    )
    .onConflictDoNothing();
}

/** Only notifications about tasks in projects the user can still see. */
async function scope(ctx: Ctx) {
  const ids = await visibleProjectIds(ctx);
  return and(
    eq(s.notifications.userId, ctx.userId),
    eq(s.notifications.workspaceId, ctx.workspaceId),
    ids.length ? inArray(s.tasks.projectId, ids) : sql`false`,
  );
}

export async function unreadCount(ctx: Ctx) {
  await createDueReminders(ctx);
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.notifications)
    .innerJoin(s.tasks, eq(s.tasks.id, s.notifications.taskId))
    .where(and(await scope(ctx), isNull(s.notifications.readAt)));
  return n;
}

export async function listNotifications(ctx: Ctx) {
  await createDueReminders(ctx);
  const db = await getDb();
  return db
    .select({
      id: s.notifications.id,
      type: s.notifications.type,
      readAt: s.notifications.readAt,
      createdAt: s.notifications.createdAt,
      actor: s.users.name,
      taskKey: sql<string>`${s.projects.key} || '-' || ${s.tasks.number}`,
      taskTitle: s.tasks.title,
      dueDate: s.tasks.dueDate,
    })
    .from(s.notifications)
    .innerJoin(s.tasks, eq(s.tasks.id, s.notifications.taskId))
    .innerJoin(s.projects, eq(s.projects.id, s.tasks.projectId))
    .leftJoin(s.users, eq(s.users.id, s.notifications.actorId))
    .where(await scope(ctx))
    .orderBy(desc(s.notifications.createdAt))
    .limit(100);
}

export async function markNotificationsRead(ctx: Ctx, input: unknown) {
  const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).max(200).optional() }), input);
  const db = await getDb();
  await db
    .update(s.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(s.notifications.userId, ctx.userId),
        eq(s.notifications.workspaceId, ctx.workspaceId),
        isNull(s.notifications.readAt),
        ids ? inArray(s.notifications.id, ids.length ? ids : [crypto.randomUUID()]) : undefined,
      ),
    );
}
