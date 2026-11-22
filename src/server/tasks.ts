import { and, asc, desc, eq, inArray, like, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction, schema as s, type Tx } from "@/db";
import { fail } from "@/lib/errors";
import { fold } from "@/lib/fold";
import { parse } from "./account";
import { audit } from "./admin";
import { can, getProject, need, projectPeople, visibleProjectIds, type Ctx } from "./ctx";
import { notify } from "./notifications";
import { projectColumns } from "./projects";
import { assertSprintFor, projectSprints } from "./sprints";

export const PRIORITIES = ["lowest", "low", "medium", "high", "highest"] as const;
const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const labelsSchema = z
  .array(z.string().trim().min(1).max(30))
  .max(10)
  // Kept as written: lower-casing the Turkish way turned "API" into "apı". Duplicates fold together.
  .transform((l) => l.filter((x, i) => l.findIndex((y) => fold(y) === fold(x)) === i));

const searchTextOf = (key: string, t: { title: string; description: string; labels: string[] }) =>
  fold([key, t.title, t.description, ...t.labels].join(" "));

type TaskRow = typeof s.tasks.$inferSelect;

/** Loads a task the caller can see. Anything else is not_found, so IDs from other companies leak nothing. */
async function loadTask(ctx: Ctx, taskId: string, tx?: Tx) {
  const db = tx ?? (await getDb());
  const [t] = await db
    .select()
    .from(s.tasks)
    .where(and(eq(s.tasks.id, taskId), eq(s.tasks.workspaceId, ctx.workspaceId)));
  if (!t) fail("not_found");
  const project = await getProject(ctx, { id: t!.projectId });
  const assigneeIds = (
    await db.select({ id: s.taskAssignees.userId }).from(s.taskAssignees).where(eq(s.taskAssignees.taskId, t!.id))
  ).map((a) => a.id);
  return { task: t!, project, assigneeIds, key: `${project.key}-${t!.number}` };
}

export function canEditTask(ctx: Ctx, t: Pick<TaskRow, "reporterId">, assigneeIds: string[]) {
  return (
    can(ctx, "tasks.edit_any") ||
    (can(ctx, "tasks.create") && (t.reporterId === ctx.userId || assigneeIds.includes(ctx.userId)))
  );
}

async function loadEditable(ctx: Ctx, taskId: string, tx?: Tx) {
  const l = await loadTask(ctx, taskId, tx);
  if (!canEditTask(ctx, l.task, l.assigneeIds)) fail("forbidden");
  return l;
}

async function log(tx: Tx, ctx: Ctx, t: Pick<TaskRow, "id" | "projectId">, type: string, data: Record<string, unknown> = {}) {
  await tx.insert(s.activities).values({ workspaceId: ctx.workspaceId, projectId: t.projectId, taskId: t.id, actorId: ctx.userId, type, data });
}

function assertCanAssign(ctx: Ctx, userId: string) {
  need(ctx, userId === ctx.userId ? "tasks.assign_self" : "tasks.assign_others");
}

async function assertAssignable(ctx: Ctx, projectId: string, userIds: string[]) {
  const people = new Set((await projectPeople(ctx, projectId)).map((p) => p.id));
  if (userIds.some((id) => !people.has(id))) fail("not_found");
}

function nextPosition(siblings: { position: number }[], index: number) {
  const i = Math.max(0, Math.min(index, siblings.length));
  const prev = siblings[i - 1]?.position;
  const next = siblings[i]?.position;
  if (prev === undefined && next === undefined) return 1000;
  if (prev === undefined) return next! - 1000;
  if (next === undefined) return prev + 1000;
  return (prev + next) / 2;
}

const createSchema = z.object({
  projectId: uuid,
  columnId: uuid.optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20000).default(""),
  priority: z.enum(PRIORITIES).default("medium"),
  dueDate: ymd.nullable().default(null),
  estimate: z.number().min(0).max(1000).nullable().default(null),
  labels: labelsSchema.default([]),
  assigneeIds: z.array(uuid).max(20).default([]),
  sprintId: uuid.nullable().default(null),
});

export async function createTask(ctx: Ctx, input: unknown) {
  need(ctx, "tasks.create");
  const data = parse(createSchema, input);
  const project = await getProject(ctx, { id: data.projectId });
  const cols = await projectColumns(project.id);
  const col = data.columnId ? cols.find((c) => c.id === data.columnId) : cols[0];
  if (!col) fail("not_found");
  const assignees = [...new Set(data.assigneeIds)];
  assignees.forEach((id) => assertCanAssign(ctx, id));
  await assertAssignable(ctx, project.id, assignees);
  if (data.sprintId) await assertSprintFor(ctx, project.id, data.sprintId);
  return transaction(async (tx) => {
    const [{ seq }] = await tx
      .update(s.projects)
      .set({ taskSeq: sql`${s.projects.taskSeq} + 1` })
      .where(eq(s.projects.id, project.id))
      .returning({ seq: s.projects.taskSeq });
    const [first] = await tx
      .select({ p: sql<number | null>`min(${s.tasks.position})` })
      .from(s.tasks)
      .where(eq(s.tasks.columnId, col!.id));
    const key = `${project.key}-${seq}`;
    const [t] = await tx
      .insert(s.tasks)
      .values({
        workspaceId: ctx.workspaceId,
        projectId: project.id,
        number: seq,
        columnId: col!.id,
        sprintId: data.sprintId,
        position: (first?.p ?? 1000) - 1000,
        title: data.title,
        description: data.description,
        priority: data.priority,
        reporterId: ctx.userId,
        dueDate: data.dueDate,
        estimate: data.estimate,
        labels: data.labels,
        searchText: searchTextOf(key, data),
        completedAt: col!.category === "done" ? new Date() : null,
      })
      .returning();
    if (assignees.length)
      await tx.insert(s.taskAssignees).values(assignees.map((userId) => ({ workspaceId: ctx.workspaceId, taskId: t.id, userId })));
    await log(tx, ctx, t, "created");
    await notify(tx, ctx, assignees, "assigned", t.id);
    return { taskId: t.id, key };
  });
}

const updateSchema = z.object({
  taskId: uuid,
  version: z.number().int(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(20000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: ymd.nullable().optional(),
  estimate: z.number().min(0).max(1000).nullable().optional(),
  labels: labelsSchema.optional(),
  sprintId: uuid.nullable().optional(),
});

export async function updateTask(ctx: Ctx, input: unknown) {
  const { taskId, version, ...patch } = parse(updateSchema, input);
  return transaction(async (tx) => {
    const { task, key } = await loadEditable(ctx, taskId, tx);
    if (patch.sprintId) await assertSprintFor(ctx, task.projectId, patch.sprintId);
    const merged = { ...task, ...patch };
    const [row] = await tx
      .update(s.tasks)
      .set({ ...patch, searchText: searchTextOf(key, merged), version: sql`${s.tasks.version} + 1`, updatedAt: new Date() })
      .where(and(eq(s.tasks.id, task.id), eq(s.tasks.version, version)))
      .returning({ version: s.tasks.version });
    if (!row) fail("conflict");
    for (const field of Object.keys(patch) as (keyof typeof patch)[]) {
      const from = task[field];
      const to = patch[field];
      if (JSON.stringify(from) === JSON.stringify(to)) continue;
      // Long text is not copied into the history, only the fact it changed.
      await log(tx, ctx, task, "field", field === "description" ? { field } : { field, from, to });
    }
    return { version: row.version };
  });
}

const moveSchema = z.object({ taskId: uuid, version: z.number().int(), columnId: uuid, index: z.number().int().min(0) });

export async function moveTask(ctx: Ctx, input: unknown) {
  const data = parse(moveSchema, input);
  return transaction(async (tx) => {
    const { task } = await loadEditable(ctx, data.taskId, tx);
    const cols = await projectColumns(task.projectId);
    const to = cols.find((c) => c.id === data.columnId) ?? fail("not_found");
    const from = cols.find((c) => c.id === task.columnId)!;
    const siblings = await tx
      .select({ position: s.tasks.position })
      .from(s.tasks)
      .where(and(eq(s.tasks.columnId, to.id), ne(s.tasks.id, task.id)))
      .orderBy(asc(s.tasks.position), asc(s.tasks.number));
    let position = nextPosition(siblings, data.index);
    // Midpoints run out of float precision after ~50 drops into one slot (or neighbours share a
    // position after concurrent moves): space the column out again, in its current order.
    if (siblings.some((x) => x.position === position)) {
      await tx.execute(sql`update ${s.tasks} set position = r.n * 1000 from (
        select id, row_number() over (order by position, number) as n from ${s.tasks} where column_id = ${to.id} and id <> ${task.id}
      ) r where ${s.tasks}.id = r.id`);
      position = nextPosition(siblings.map((_, i) => ({ position: (i + 1) * 1000 })), data.index);
    }
    const completedAt = to.category === "done" ? (from.category === "done" ? task.completedAt : new Date()) : null;
    const [row] = await tx
      .update(s.tasks)
      .set({
        columnId: to.id,
        position,
        completedAt,
        version: sql`${s.tasks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(s.tasks.id, task.id), eq(s.tasks.version, data.version)))
      .returning({ version: s.tasks.version });
    if (!row) fail("conflict");
    if (from.id !== to.id) await log(tx, ctx, task, "moved", { from: from.id, to: to.id });
    return { version: row.version };
  });
}

export async function deleteTask(ctx: Ctx, input: unknown) {
  need(ctx, "tasks.delete");
  const { taskId } = parse(z.object({ taskId: uuid }), input);
  await transaction(async (tx) => {
    const { task, key } = await loadTask(ctx, taskId, tx);
    await tx.delete(s.tasks).where(eq(s.tasks.id, task.id));
    await tx.insert(s.activities).values({
      workspaceId: ctx.workspaceId,
      projectId: task.projectId,
      actorId: ctx.userId,
      type: "deleted",
      data: { key, title: task.title },
    });
    await audit(tx, ctx, "task.deleted", { key, title: task.title });
  });
}

export async function copyTask(ctx: Ctx, input: unknown) {
  need(ctx, "tasks.create");
  const { taskId } = parse(z.object({ taskId: uuid }), input);
  const { task } = await loadTask(ctx, taskId);
  const db = await getDb();
  const items = await db.select().from(s.checklistItems).where(eq(s.checklistItems.taskId, task.id)).orderBy(asc(s.checklistItems.position));
  const prefix = ctx.locale === "tr" ? "Kopya: " : "Copy of ";
  // The copy joins the original's sprint unless that sprint is closed.
  const [sprint] = task.sprintId ? await db.select({ state: s.sprints.state }).from(s.sprints).where(eq(s.sprints.id, task.sprintId)) : [];
  return transaction(async (tx) => {
    const created = await createTask(ctx, {
      projectId: task.projectId,
      columnId: task.columnId,
      title: (prefix + task.title).slice(0, 200),
      description: task.description,
      priority: task.priority,
      estimate: task.estimate,
      labels: task.labels,
      sprintId: sprint && sprint.state !== "closed" ? task.sprintId : null,
    });
    if (items.length)
      await tx.insert(s.checklistItems).values(
        items.map((i) => ({ workspaceId: ctx.workspaceId, taskId: created.taskId, text: i.text, position: i.position })),
      );
    return created;
  });
}

const assignSchema = z.object({ taskId: uuid, userId: uuid });

export async function assignTask(ctx: Ctx, input: unknown) {
  const data = parse(assignSchema, input);
  assertCanAssign(ctx, data.userId);
  await transaction(async (tx) => {
    const { task, assigneeIds } = await loadTask(ctx, data.taskId, tx);
    if (assigneeIds.includes(data.userId)) return;
    await assertAssignable(ctx, task.projectId, [data.userId]);
    await tx.insert(s.taskAssignees).values({ workspaceId: ctx.workspaceId, taskId: task.id, userId: data.userId });
    await log(tx, ctx, task, "assigned", { userId: data.userId });
    await notify(tx, ctx, [data.userId], "assigned", task.id);
  });
}

export async function unassignTask(ctx: Ctx, input: unknown) {
  const data = parse(assignSchema, input);
  assertCanAssign(ctx, data.userId);
  await transaction(async (tx) => {
    const { task, assigneeIds } = await loadTask(ctx, data.taskId, tx);
    if (!assigneeIds.includes(data.userId)) return;
    await tx.delete(s.taskAssignees).where(and(eq(s.taskAssignees.taskId, task.id), eq(s.taskAssignees.userId, data.userId)));
    await log(tx, ctx, task, "unassigned", { userId: data.userId });
  });
}

export async function addChecklistItem(ctx: Ctx, input: unknown) {
  const data = parse(z.object({ taskId: uuid, text: z.string().trim().min(1).max(300) }), input);
  const { task } = await loadEditable(ctx, data.taskId);
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`coalesce(max(${s.checklistItems.position}), 0)::int` })
    .from(s.checklistItems)
    .where(eq(s.checklistItems.taskId, task.id));
  await db.insert(s.checklistItems).values({ workspaceId: ctx.workspaceId, taskId: task.id, text: data.text, position: n + 1 });
}

async function loadItem(ctx: Ctx, itemId: string) {
  const db = await getDb();
  const [item] = await db
    .select()
    .from(s.checklistItems)
    .where(and(eq(s.checklistItems.id, itemId), eq(s.checklistItems.workspaceId, ctx.workspaceId)));
  if (!item) fail("not_found");
  await loadEditable(ctx, item!.taskId);
  return item!;
}

export async function toggleChecklistItem(ctx: Ctx, input: unknown) {
  const data = parse(z.object({ itemId: uuid, done: z.boolean() }), input);
  const item = await loadItem(ctx, data.itemId);
  const db = await getDb();
  await db.update(s.checklistItems).set({ done: data.done }).where(eq(s.checklistItems.id, item.id));
}

export async function deleteChecklistItem(ctx: Ctx, input: unknown) {
  const data = parse(z.object({ itemId: uuid }), input);
  const item = await loadItem(ctx, data.itemId);
  const db = await getDb();
  await db.delete(s.checklistItems).where(eq(s.checklistItems.id, item.id));
}

/** @handle = the part of a colleague's email before the @. */
export const handleOf = (email: string) => email.split("@")[0].toLowerCase();

export async function addComment(ctx: Ctx, input: unknown) {
  need(ctx, "comments.create");
  const data = parse(z.object({ taskId: uuid, body: z.string().trim().min(1).max(10000) }), input);
  await transaction(async (tx) => {
    const { task } = await loadTask(ctx, data.taskId, tx);
    await tx.insert(s.comments).values({ workspaceId: ctx.workspaceId, taskId: task.id, authorId: ctx.userId, body: data.body });
    await log(tx, ctx, task, "commented");
    // A handle ends in a letter or digit, so "@ayse." at the end of a sentence still mentions ayse.
    const handles = new Set([...data.body.matchAll(/(?<![\w.])@([\w.-]*\w)/g)].map((m) => m[1].toLowerCase()));
    if (handles.size) {
      const people = await projectPeople(ctx, task.projectId);
      await notify(tx, ctx, people.filter((p) => handles.has(handleOf(p.email))).map((p) => p.id), "mentioned", task.id);
    }
  });
}

export function parseTaskKey(key: string) {
  const m = /^([A-Za-z][A-Za-z0-9]{1,5})-(\d{1,9})$/.exec(key);
  return m ? { projectKey: m[1].toUpperCase(), number: Number(m[2]) } : null;
}

export async function getTaskDetail(ctx: Ctx, key: string) {
  const ref = parseTaskKey(key) ?? fail("not_found");
  const project = await getProject(ctx, { key: ref.projectKey });
  const db = await getDb();
  const [t] = await db
    .select()
    .from(s.tasks)
    .where(and(eq(s.tasks.projectId, project.id), eq(s.tasks.number, ref.number), eq(s.tasks.workspaceId, ctx.workspaceId)));
  if (!t) fail("not_found");
  const { assigneeIds } = await loadTask(ctx, t!.id);
  const [columns, checklist, commentRows, activity, people, sprints] = await Promise.all([
    projectColumns(project.id),
    db.select().from(s.checklistItems).where(eq(s.checklistItems.taskId, t!.id)).orderBy(asc(s.checklistItems.position)),
    db
      .select({ id: s.comments.id, body: s.comments.body, createdAt: s.comments.createdAt, authorId: s.comments.authorId })
      .from(s.comments)
      .where(eq(s.comments.taskId, t!.id))
      .orderBy(asc(s.comments.createdAt)),
    db.select().from(s.activities).where(eq(s.activities.taskId, t!.id)).orderBy(desc(s.activities.createdAt)).limit(100),
    // Everyone in the workspace, so history still names people who left the project.
    db.select({ id: s.users.id, name: s.users.name, email: s.users.email, active: s.users.active }).from(s.users).where(eq(s.users.workspaceId, ctx.workspaceId)),
    projectSprints(project.id),
  ]);
  const assignable = (await projectPeople(ctx, project.id)).map((p) => p.id);
  return {
    project,
    task: { ...t!, key: `${project.key}-${t!.number}`, assigneeIds },
    columns,
    checklist,
    comments: commentRows,
    activity,
    people,
    sprints,
    assignable,
    canEdit: canEditTask(ctx, t!, assigneeIds),
  };
}

export type TaskDetail = Awaited<ReturnType<typeof getTaskDetail>>;

export const SEARCH_PAGE = 50;

/** One page (0-based) of matches, newest change first. */
export async function searchTasks(ctx: Ctx, q: string, page = 0) {
  const needle = fold(q.trim()).slice(0, 100);
  if (!needle) return [];
  const ids = await visibleProjectIds(ctx);
  if (!ids.length) return [];
  const db = await getDb();
  const escaped = needle.replace(/[\\%_]/g, (c) => `\\${c}`);
  return db
    .select({
      id: s.tasks.id,
      key: sql<string>`${s.projects.key} || '-' || ${s.tasks.number}`,
      title: s.tasks.title,
      priority: s.tasks.priority,
      dueDate: s.tasks.dueDate,
      projectName: s.projects.name,
      category: s.columns.category,
      columnName: s.columns.name,
      columnKey: s.columns.defaultKey,
      /** All matches, across pages. */
      total: sql<number>`(count(*) over ())::int`,
    })
    .from(s.tasks)
    .innerJoin(s.projects, eq(s.projects.id, s.tasks.projectId))
    .innerJoin(s.columns, eq(s.columns.id, s.tasks.columnId))
    .where(and(eq(s.tasks.workspaceId, ctx.workspaceId), inArray(s.tasks.projectId, ids), like(s.tasks.searchText, `%${escaped}%`)))
    .orderBy(desc(s.tasks.updatedAt), asc(s.tasks.id))
    .limit(SEARCH_PAGE)
    .offset(Math.max(0, Math.floor(page)) * SEARCH_PAGE);
}
