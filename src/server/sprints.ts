import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction, schema as s } from "@/db";
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

/** Only planned sprints can be deleted (closed ones are the team's record); their tasks return to the backlog. */
export async function deleteSprint(ctx: Ctx, input: unknown) {
  need(ctx, "projects.manage");
  const { sprintId } = parse(z.object({ sprintId: uuid }), input);
  const sp = await loadSprint(ctx, sprintId);
  if (sp.state !== "planned") fail("sprint_state");
  const db = await getDb();
  await db.delete(s.sprints).where(eq(s.sprints.id, sp.id));
}
