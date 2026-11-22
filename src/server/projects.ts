import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction, schema as s, type Tx } from "@/db";
import { fail } from "@/lib/errors";
import { parse } from "./account";
import { getProject, need, projectPeople, visibleProjects, type Ctx } from "./ctx";
import { projectSprints } from "./sprints";

export const DEFAULT_COLUMNS = [
  { defaultKey: "todo", category: "todo" },
  { defaultKey: "in_progress", category: "doing" },
  { defaultKey: "in_review", category: "doing" },
  { defaultKey: "done", category: "done" },
] as const;

export const CATEGORIES = ["todo", "doing", "done"] as const;

export async function listProjects(ctx: Ctx) {
  const list = await visibleProjects(ctx);
  if (!list.length) return [];
  const db = await getDb();
  const counts = await db
    .select({
      projectId: s.tasks.projectId,
      open: sql<number>`count(*) filter (where ${s.columns.category} <> 'done')::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(s.tasks)
    .innerJoin(s.columns, eq(s.columns.id, s.tasks.columnId))
    .where(inArray(s.tasks.projectId, list.map((p) => p.id)))
    .groupBy(s.tasks.projectId);
  return list.map((p) => ({ ...p, open: 0, total: 0, ...counts.find((c) => c.projectId === p.id) }));
}

const projectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).default(""),
  restricted: z.boolean().default(false),
  memberIds: z.array(z.string().uuid()).max(500).default([]),
});

async function setMembers(tx: Tx, ctx: Ctx, projectId: string, ids: string[]) {
  await tx.delete(s.projectMembers).where(eq(s.projectMembers.projectId, projectId));
  if (!ids.length) return;
  const valid = await tx
    .select({ id: s.users.id })
    .from(s.users)
    .where(and(eq(s.users.workspaceId, ctx.workspaceId), inArray(s.users.id, ids)));
  if (valid.length !== new Set(ids).size) fail("not_found");
  await tx.insert(s.projectMembers).values(valid.map((u) => ({ workspaceId: ctx.workspaceId, projectId, userId: u.id })));
}

export async function createProject(ctx: Ctx, input: unknown) {
  need(ctx, "projects.manage");
  const data = parse(
    projectSchema.extend({
      key: z
        .string()
        .trim()
        .transform((k) => k.toUpperCase())
        .pipe(z.string().regex(/^[A-Z][A-Z0-9]{1,5}$/)),
    }),
    input,
  );
  return transaction(async (tx) => {
    const [taken] = await tx
      .select({ id: s.projects.id })
      .from(s.projects)
      .where(and(eq(s.projects.workspaceId, ctx.workspaceId), eq(s.projects.key, data.key)));
    if (taken) fail("key_taken");
    const [p] = await tx
      .insert(s.projects)
      .values({ workspaceId: ctx.workspaceId, key: data.key, name: data.name, description: data.description, restricted: data.restricted })
      .returning();
    await tx
      .insert(s.columns)
      .values(DEFAULT_COLUMNS.map((c, i) => ({ ...c, workspaceId: ctx.workspaceId, projectId: p.id, position: i })));
    await setMembers(tx, ctx, p.id, data.memberIds);
    return { projectId: p.id, key: p.key };
  });
}

export async function updateProject(ctx: Ctx, input: unknown) {
  need(ctx, "projects.manage");
  const data = parse(projectSchema.extend({ projectId: z.string().uuid() }), input);
  const p = await getProject(ctx, { id: data.projectId });
  await transaction(async (tx) => {
    await tx
      .update(s.projects)
      .set({ name: data.name, description: data.description, restricted: data.restricted })
      .where(eq(s.projects.id, p.id));
    await setMembers(tx, ctx, p.id, data.memberIds);
  });
}

export async function projectMemberIds(ctx: Ctx, projectId: string) {
  const db = await getDb();
  const rows = await db
    .select({ userId: s.projectMembers.userId })
    .from(s.projectMembers)
    .where(and(eq(s.projectMembers.projectId, projectId), eq(s.projectMembers.workspaceId, ctx.workspaceId)));
  return rows.map((r) => r.userId);
}

async function columnFor(ctx: Ctx, columnId: string) {
  const db = await getDb();
  const [c] = await db
    .select()
    .from(s.columns)
    .where(and(eq(s.columns.id, columnId), eq(s.columns.workspaceId, ctx.workspaceId)));
  if (!c) fail("not_found");
  await getProject(ctx, { id: c!.projectId });
  return c!;
}

export async function projectColumns(projectId: string) {
  const db = await getDb();
  return db.select().from(s.columns).where(eq(s.columns.projectId, projectId)).orderBy(asc(s.columns.position));
}

const columnFields = {
  /** null keeps the translated default name of a built-in column */
  name: z.string().trim().min(1).max(40).nullable(),
  category: z.enum(CATEGORIES),
  wipLimit: z.number().int().min(1).max(999).nullable(),
};

export async function addColumn(ctx: Ctx, input: unknown) {
  need(ctx, "projects.manage");
  const data = parse(z.object({ projectId: z.string().uuid(), ...columnFields, name: columnFields.name.unwrap() }), input);
  const p = await getProject(ctx, { id: data.projectId });
  const cols = await projectColumns(p.id);
  const doneAt = cols.findIndex((c) => c.category === "done");
  // New working columns go before the first "done" column; everything after shifts right.
  const position = data.category !== "done" && doneAt >= 0 ? cols[doneAt].position : cols.length;
  await transaction(async (tx) => {
    await tx
      .update(s.columns)
      .set({ position: sql`${s.columns.position} + 1` })
      .where(and(eq(s.columns.projectId, p.id), sql`${s.columns.position} >= ${position}`));
    await tx.insert(s.columns).values({ name: data.name, category: data.category, wipLimit: data.wipLimit, workspaceId: ctx.workspaceId, projectId: p.id, position });
  });
}

export async function updateColumn(ctx: Ctx, input: unknown) {
  need(ctx, "projects.manage");
  const data = parse(z.object({ columnId: z.string().uuid(), ...columnFields }), input);
  const c = await columnFor(ctx, data.columnId);
  const db = await getDb();
  await db
    .update(s.columns)
    .set({ name: data.name, category: data.category, wipLimit: data.wipLimit })
    .where(eq(s.columns.id, c.id));
}

export async function moveColumn(ctx: Ctx, input: unknown) {
  need(ctx, "projects.manage");
  const data = parse(z.object({ columnId: z.string().uuid(), dir: z.union([z.literal(-1), z.literal(1)]) }), input);
  const c = await columnFor(ctx, data.columnId);
  const cols = await projectColumns(c.projectId);
  const i = cols.findIndex((x) => x.id === c.id);
  const other = cols[i + data.dir];
  if (!other) return;
  await transaction(async (tx) => {
    await tx.update(s.columns).set({ position: other.position }).where(eq(s.columns.id, c.id));
    await tx.update(s.columns).set({ position: c.position }).where(eq(s.columns.id, other.id));
  });
}

export async function deleteColumn(ctx: Ctx, input: unknown) {
  need(ctx, "projects.manage");
  const { columnId } = parse(z.object({ columnId: z.string().uuid() }), input);
  const c = await columnFor(ctx, columnId);
  const db = await getDb();
  const [used] = await db.select({ id: s.tasks.id }).from(s.tasks).where(eq(s.tasks.columnId, c.id)).limit(1);
  const cols = await projectColumns(c.projectId);
  if (used || cols.length <= 1) fail("column_not_empty");
  await db.delete(s.columns).where(eq(s.columns.id, c.id));
}

/** Everything the board screen needs in one go. */
export async function getBoard(ctx: Ctx, key: string) {
  const project = await getProject(ctx, { key });
  const db = await getDb();
  const [cols, rows, people, sprints] = await Promise.all([
    projectColumns(project.id),
    db
      .select({
        id: s.tasks.id,
        number: s.tasks.number,
        columnId: s.tasks.columnId,
        sprintId: s.tasks.sprintId,
        position: s.tasks.position,
        title: s.tasks.title,
        priority: s.tasks.priority,
        dueDate: s.tasks.dueDate,
        estimate: s.tasks.estimate,
        labels: s.tasks.labels,
        version: s.tasks.version,
        searchText: s.tasks.searchText,
        reporterId: s.tasks.reporterId,
        createdAt: s.tasks.createdAt,
        assigneeIds: sql<string[]>`coalesce((select array_agg(a.user_id::text order by a.user_id) from ${s.taskAssignees} a where a.task_id = ${s.tasks}.id), '{}')`,
        checklistTotal: sql<number>`(select count(*)::int from ${s.checklistItems} c where c.task_id = ${s.tasks}.id)`,
        checklistDone: sql<number>`(select count(*)::int from ${s.checklistItems} c where c.task_id = ${s.tasks}.id and c.done)`,
        commentCount: sql<number>`(select count(*)::int from ${s.comments} c where c.task_id = ${s.tasks}.id)`,
      })
      .from(s.tasks)
      .where(and(eq(s.tasks.projectId, project.id), eq(s.tasks.workspaceId, ctx.workspaceId)))
      .orderBy(asc(s.tasks.position)),
    projectPeople(ctx, project.id),
    projectSprints(project.id),
  ]);
  const tasks = rows.map((t) => ({ ...t, key: `${project.key}-${t.number}` }));
  return { project, columns: cols, tasks, people, sprints };
}

export type Board = Awaited<ReturnType<typeof getBoard>>;
export type BoardTask = Board["tasks"][number];
export type Sprint = Board["sprints"][number];
