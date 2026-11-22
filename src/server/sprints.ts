import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction, schema as s } from "@/db";
import { addDays, daysBetween, today } from "@/lib/dates";
import { fail } from "@/lib/errors";
import { parse } from "./account";
import { getProject, need, type Ctx } from "./ctx";

const uuid = z.string().uuid();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fields = {
  name: z.string().trim().min(1).max(60),
  goal: z.string().trim().max(500).default(""),
  startDate: ymd.nullable().default(null),
  endDate: ymd.nullable().default(null),
};
const datesInOrder = (d: { startDate: string | null; endDate: string | null }) => !d.startDate || !d.endDate || d.startDate <= d.endDate;

export async function projectSprints(projectId: string) {
  const db = await getDb();
  return db.select().from(s.sprints).where(eq(s.sprints.projectId, projectId)).orderBy(asc(s.sprints.createdAt));
}

/** A sprint of a project the caller can see, or not_found. */
async function loadSprint(ctx: Ctx, sprintId: string) {
  const db = await getDb();
  const [sp] = await db
    .select()
    .from(s.sprints)
    .where(and(eq(s.sprints.id, sprintId), eq(s.sprints.workspaceId, ctx.workspaceId)));
  if (!sp) fail("not_found");
  await getProject(ctx, { id: sp!.projectId });
  return sp!;
}

/** A task may only be put into an open (planned or active) sprint of its own project. */
export async function assertSprintFor(ctx: Ctx, projectId: string, sprintId: string) {
  const db = await getDb();
  const [sp] = await db
    .select({ state: s.sprints.state })
    .from(s.sprints)
    .where(and(eq(s.sprints.id, sprintId), eq(s.sprints.projectId, projectId), eq(s.sprints.workspaceId, ctx.workspaceId)));
  if (!sp) fail("not_found");
  if (sp!.state === "closed") fail("sprint_state");
}

export async function createSprint(ctx: Ctx, input: unknown) {
  need(ctx, "projects.manage");
  const data = parse(z.object({ projectId: uuid, ...fields, name: fields.name.optional() }).refine(datesInOrder), input);
  const project = await getProject(ctx, { id: data.projectId });
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.sprints).where(eq(s.sprints.projectId, project.id));
  const [sp] = await db
    .insert(s.sprints)
    .values({
      workspaceId: ctx.workspaceId,
      projectId: project.id,
      name: data.name ?? `Sprint ${n + 1}`,
      goal: data.goal,
      startDate: data.startDate,
      endDate: data.endDate,
    })
    .returning({ id: s.sprints.id, name: s.sprints.name });
  return { sprintId: sp.id, name: sp.name };
}

export async function updateSprint(ctx: Ctx, input: unknown) {
  need(ctx, "projects.manage");
  const data = parse(z.object({ sprintId: uuid, ...fields }).refine(datesInOrder), input);
  const sp = await loadSprint(ctx, data.sprintId);
  const db = await getDb();
  await db
    .update(s.sprints)
    .set({ name: data.name, goal: data.goal, startDate: data.startDate, endDate: data.endDate })
    .where(eq(s.sprints.id, sp.id));
}

export async function startSprint(ctx: Ctx, input: unknown) {
  need(ctx, "projects.manage");
  const data = parse(z.object({ sprintId: uuid, startDate: ymd, endDate: ymd, goal: fields.goal }).refine(datesInOrder), input);
  const sp = await loadSprint(ctx, data.sprintId);
  if (sp.state !== "planned") fail("sprint_state");
  await transaction(async (tx) => {
    const [active] = await tx
      .select({ id: s.sprints.id })
      .from(s.sprints)
      .where(and(eq(s.sprints.projectId, sp.projectId), eq(s.sprints.state, "active")));
    if (active) fail("sprint_active");
    await tx
      .update(s.sprints)
      .set({ state: "active", startDate: data.startDate, endDate: data.endDate, goal: data.goal })
      .where(eq(s.sprints.id, sp.id));
  });
}

/** Closes the active sprint. Its unfinished tasks go to the backlog or to a planned sprint; done tasks stay as its record. */
export async function completeSprint(ctx: Ctx, input: unknown) {
  need(ctx, "projects.manage");
  const data = parse(z.object({ sprintId: uuid, moveTo: uuid.nullable().default(null) }), input);
  const sp = await loadSprint(ctx, data.sprintId);
  if (sp.state !== "active") fail("sprint_state");
  if (data.moveTo) {
    const target = await loadSprint(ctx, data.moveTo);
    if (target.projectId !== sp.projectId) fail("not_found");
    if (target.state !== "planned") fail("sprint_state");
  }
  return transaction(async (tx) => {
    const doneCols = tx
      .select({ id: s.columns.id })
      .from(s.columns)
      .where(and(eq(s.columns.projectId, sp.projectId), eq(s.columns.category, "done")));
    const moved = await tx
      .update(s.tasks)
      .set({ sprintId: data.moveTo })
      .where(and(eq(s.tasks.sprintId, sp.id), sql`${s.tasks.columnId} not in ${doneCols}`))
      .returning({ id: s.tasks.id });
    await tx.update(s.sprints).set({ state: "closed", closedAt: new Date() }).where(eq(s.sprints.id, sp.id));
    return { moved: moved.length };
  });
}

export type BurndownTask = { estimate: number | null; joinedAt: Date; completedAt: Date | null };

/**
 * Remaining work per day (app time zone) from the start date to the end date, or to today when the
 * sprint runs over. A task counts from the day it joined the sprint until the day it was finished;
 * tasks taken out of the sprint are not counted at all. Points when any task has an estimate, else tasks.
 */
export function burndown(sp: { startDate: string; endDate: string }, tasks: BurndownTask[], now = new Date()) {
  const t = today(0, now);
  const unit: "points" | "tasks" = tasks.some((x) => (x.estimate ?? 0) > 0) ? "points" : "tasks";
  const rows = tasks.map((x) => ({
    size: unit === "points" ? (x.estimate ?? 0) : 1,
    joined: today(0, x.joinedAt),
    done: x.completedAt ? today(0, x.completedAt) : null,
  }));
  const remainingOn = (d: string) => rows.reduce((n, r) => n + (r.joined <= d && !(r.done && r.done <= d) ? r.size : 0), 0);
  const total = rows.reduce((n, r) => n + r.size, 0);
  const span = daysBetween(sp.startDate, sp.endDate);
  const length = daysBetween(sp.startDate, t > sp.endDate ? t : sp.endDate) + 1;
  // The guideline runs from what the sprint started with (Jira's "ideal") down to zero on the end date.
  const commitment = remainingOn(sp.startDate) || total;
  const ideal = (k: number) => (span > 0 ? Math.max(0, commitment * (1 - k / span)) : 0);
  const days = Array.from({ length }, (_, k) => {
    const date = addDays(sp.startDate, k);
    return { date, remaining: date <= t ? remainingOn(date) : null, ideal: ideal(k) };
  });
  const remaining = remainingOn(t);
  const idealNow = t < sp.startDate ? commitment : ideal(daysBetween(sp.startDate, t));
  const done = rows.filter((r) => r.done).length;
  return { unit, total, remaining, done, count: rows.length, days, behind: Math.round((remaining - idealNow) * 10) / 10 };
}

/** Running sprints of the given (already visible) projects, each with its burndown. */
export async function activeSprintReports(ctx: Ctx, projectIds: string[]) {
  if (!projectIds.length) return [];
  const db = await getDb();
  const active = await db
    .select({ sprint: s.sprints, projectKey: s.projects.key, projectName: s.projects.name })
    .from(s.sprints)
    .innerJoin(s.projects, eq(s.projects.id, s.sprints.projectId))
    .where(and(eq(s.sprints.workspaceId, ctx.workspaceId), eq(s.sprints.state, "active"), inArray(s.sprints.projectId, projectIds)))
    .orderBy(asc(s.projects.key));
  if (!active.length) return [];
  const rows = await db
    .select({
      sprintId: s.tasks.sprintId,
      estimate: s.tasks.estimate,
      completedAt: s.tasks.completedAt,
      // When it last joined this sprint (task history), else when it was created (created inside it).
      joinedAt: sql<string>`coalesce((select max(a.created_at) from ${s.activities} a where a.task_id = ${s.tasks}.id and a.type = 'field'
        and a.data->>'field' = 'sprintId' and a.data->>'to' = ${s.tasks}.sprint_id::text), ${s.tasks}.created_at)`,
    })
    .from(s.tasks)
    .where(and(eq(s.tasks.workspaceId, ctx.workspaceId), inArray(s.tasks.sprintId, active.map((a) => a.sprint.id))));
  return active.map(({ sprint, projectKey, projectName }) => ({
    sprint,
    projectKey,
    projectName,
    ...burndown(
      { startDate: sprint.startDate!, endDate: sprint.endDate! },
      rows.filter((r) => r.sprintId === sprint.id).map((r) => ({ estimate: r.estimate, completedAt: r.completedAt, joinedAt: new Date(r.joinedAt) })),
    ),
  }));
}

/** Only planned sprints can be deleted (closed ones are the team's record); their tasks return to the backlog. */
export async function deleteSprint(ctx: Ctx, input: unknown) {
  need(ctx, "projects.manage");
  const { sprintId } = parse(z.object({ sprintId: uuid }), input);
  const sp = await loadSprint(ctx, sprintId);
  if (sp.state !== "planned") fail("sprint_state");
  const db = await getDb();
  await db.delete(s.sprints).where(eq(s.sprints.id, sp.id));
}
