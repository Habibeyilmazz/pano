import { and, asc, desc, eq, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { addDays, today, weekStart, weekStartInstant } from "@/lib/dates";
import { fail } from "@/lib/errors";
import { byName, need, visibleProjectIds, type Ctx } from "./ctx";

const PRIORITY_RANK: Record<string, number> = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };
const RECENT_DONE_DAYS = 14;

export type WorkItem = Awaited<ReturnType<typeof workItems>>[number];

/**
 * Task-per-assignee rows in projects the caller can see. Every "who is doing what" view is built
 * from this one query, so scoping lives in exactly one place.
 */
async function workItems(ctx: Ctx, opts: { projectId?: string; userIds?: string[]; doneSince?: Date }) {
  const visible = await visibleProjectIds(ctx);
  const ids = opts.projectId ? visible.filter((id) => id === opts.projectId) : visible;
  if (opts.projectId && !ids.length) fail("not_found");
  if (!ids.length) return [];
  const db = await getDb();
  const doneSince = opts.doneSince ?? new Date(Date.now() - RECENT_DONE_DAYS * 864e5);
  const rows = await db
    .select({
      taskId: s.tasks.id,
      userId: s.taskAssignees.userId,
      key: sql<string>`${s.projects.key} || '-' || ${s.tasks.number}`,
      projectKey: s.projects.key,
      title: s.tasks.title,
      priority: s.tasks.priority,
      dueDate: s.tasks.dueDate,
      estimate: s.tasks.estimate,
      category: s.columns.category,
      columnName: s.columns.name,
      columnKey: s.columns.defaultKey,
      completedAt: s.tasks.completedAt,
      updatedAt: s.tasks.updatedAt,
    })
    .from(s.taskAssignees)
    .innerJoin(s.tasks, eq(s.tasks.id, s.taskAssignees.taskId))
    .innerJoin(s.projects, eq(s.projects.id, s.tasks.projectId))
    .innerJoin(s.columns, eq(s.columns.id, s.tasks.columnId))
    .where(
      and(
        eq(s.tasks.workspaceId, ctx.workspaceId),
        inArray(s.tasks.projectId, ids),
        opts.userIds ? inArray(s.taskAssignees.userId, opts.userIds) : undefined,
        sql`(${s.columns.category} <> 'done' or ${s.tasks.completedAt} >= ${doneSince.toISOString()})`,
      ),
    );
  const now = today();
  return rows
    .map((r) => ({ ...r, overdue: r.category !== "done" && !!r.dueDate && r.dueDate < now }))
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    );
}

function group(items: WorkItem[]) {
  const done = items
    .filter((i) => i.category === "done")
    .sort((a, b) => +(b.completedAt ?? 0) - +(a.completedAt ?? 0));
  const open = items.filter((i) => i.category !== "done");
  return {
    doing: items.filter((i) => i.category === "doing"),
    todo: items.filter((i) => i.category === "todo"),
    done,
    overdue: open.filter((i) => i.overdue).length,
    openPoints: open.reduce((n, i) => n + (i.estimate ?? 0), 0),
  };
}

export async function myWork(ctx: Ctx) {
  return group(await workItems(ctx, { userIds: [ctx.userId] }));
}

async function activePeople(ctx: Ctx, userIds?: string[]) {
  const db = await getDb();
  return db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email, roleName: s.roles.name, roleBuiltin: s.roles.builtin })
    .from(s.users)
    .innerJoin(s.roles, eq(s.roles.id, s.users.roleId))
    .where(
      and(
        eq(s.users.workspaceId, ctx.workspaceId),
        eq(s.users.active, true),
        userIds ? inArray(s.users.id, userIds) : undefined,
      ),
    )
    .then((rows) => rows.sort(byName));
}

/** One row per person: what they are doing now, what is next, what they finished this week. */
export async function team(ctx: Ctx, projectId?: string) {
  const since = weekStartInstant();
  const [people, items] = await Promise.all([activePeople(ctx), workItems(ctx, { projectId, doneSince: since })]);
  return people.map((p) => ({ ...p, ...group(items.filter((i) => i.userId === p.id)) }));
}

export async function person(ctx: Ctx, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) fail("not_found");
  const db = await getDb();
  const [u] = await db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email, active: s.users.active, roleName: s.roles.name, roleBuiltin: s.roles.builtin })
    .from(s.users)
    .innerJoin(s.roles, eq(s.roles.id, s.users.roleId))
    .where(and(eq(s.users.id, userId), eq(s.users.workspaceId, ctx.workspaceId)));
  if (!u) fail("not_found");
  const visible = await visibleProjectIds(ctx);
  const [items, activity] = await Promise.all([
    workItems(ctx, { userIds: [userId], doneSince: weekStartInstant() }),
    visible.length
      ? db
          .select({
            id: s.activities.id,
            type: s.activities.type,
            data: s.activities.data,
            createdAt: s.activities.createdAt,
            taskKey: sql<string | null>`(select p.key || '-' || t.number from ${s.tasks} t join ${s.projects} p on p.id = t.project_id where t.id = ${s.activities}.task_id)`,
            taskTitle: sql<string | null>`(select t.title from ${s.tasks} t where t.id = ${s.activities}.task_id)`,
          })
          .from(s.activities)
          .where(and(eq(s.activities.actorId, userId), eq(s.activities.workspaceId, ctx.workspaceId), inArray(s.activities.projectId, visible)))
          .orderBy(desc(s.activities.createdAt))
          .limit(30)
      : [],
  ]);
  const [columns, people] = await Promise.all([
    visible.length
      ? db.select({ id: s.columns.id, name: s.columns.name, defaultKey: s.columns.defaultKey }).from(s.columns).where(inArray(s.columns.projectId, visible))
      : [],
    db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(eq(s.users.workspaceId, ctx.workspaceId)),
  ]);
  return { user: u!, ...group(items), activity, columns, people };
}

export async function dashboard(ctx: Ctx, projectId?: string) {
  need(ctx, "reports.view");
  const visible = await visibleProjectIds(ctx);
  const ids = projectId ? visible.filter((id) => id === projectId) : visible;
  if (projectId && !ids.length) fail("not_found");
  const weeks = 8;
  const firstWeek = addDays(weekStart(today()), -7 * (weeks - 1));
  const db = await getDb();
  const [status, done, workload, overdue] = await Promise.all([
    db
      .select({ category: s.columns.category, n: sql<number>`count(*)::int` })
      .from(s.tasks)
      .innerJoin(s.columns, eq(s.columns.id, s.tasks.columnId))
      .where(and(eq(s.tasks.workspaceId, ctx.workspaceId), inArray(s.tasks.projectId, ids)))
      .groupBy(s.columns.category),
    db
      .select({ completedAt: s.tasks.completedAt })
      .from(s.tasks)
      .innerJoin(s.columns, eq(s.columns.id, s.tasks.columnId))
      .where(
        and(
          eq(s.tasks.workspaceId, ctx.workspaceId),
          inArray(s.tasks.projectId, ids),
          eq(s.columns.category, "done"),
          isNotNull(s.tasks.completedAt),
          // A day early so the app time zone's Monday 00:00 is inside; the loop below drops the extra.
          gte(s.tasks.completedAt, new Date(Date.parse(`${firstWeek}T00:00:00Z`) - 864e5)),
        ),
      ),
    team(ctx, projectId),
    db
      .select({
        taskId: s.tasks.id,
        key: sql<string>`${s.projects.key} || '-' || ${s.tasks.number}`,
        projectKey: s.projects.key,
        title: s.tasks.title,
        priority: s.tasks.priority,
        dueDate: s.tasks.dueDate,
        assignees: sql<string[]>`coalesce((select array_agg(u.name order by u.name) from ${s.taskAssignees} a join ${s.users} u on u.id = a.user_id where a.task_id = ${s.tasks}.id), '{}')`,
        total: sql<number>`(count(*) over ())::int`,
      })
      .from(s.tasks)
      .innerJoin(s.projects, eq(s.projects.id, s.tasks.projectId))
      .innerJoin(s.columns, eq(s.columns.id, s.tasks.columnId))
      .where(
        and(
          eq(s.tasks.workspaceId, ctx.workspaceId),
          inArray(s.tasks.projectId, ids),
          ne(s.columns.category, "done"),
          lt(s.tasks.dueDate, today()),
        ),
      )
      .orderBy(asc(s.tasks.dueDate))
      .limit(50),
  ]);
  const byStatus = { todo: 0, doing: 0, done: 0, ...Object.fromEntries(status.map((r) => [r.category, r.n])) };
  const perWeek = Array.from({ length: weeks }, (_, i) => ({ week: addDays(firstWeek, 7 * i), done: 0 }));
  for (const d of done) {
    const w = weekStart(today(0, d.completedAt!));
    const slot = perWeek.find((p) => p.week === w);
    if (slot) slot.done++;
  }
  return { byStatus, perWeek, overdue, overdueTotal: overdue[0]?.total ?? 0, workload: workload.filter((w) => w.doing.length + w.todo.length > 0) };
}
