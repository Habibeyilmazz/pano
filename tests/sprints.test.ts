import { and, eq, inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, schema as s } from "@/db";
import { addDays, daysBetween, today } from "@/lib/dates";
import * as admin from "@/server/admin";
import { exportCsv } from "@/server/export";
import * as projects from "@/server/projects";
import * as sprints from "@/server/sprints";
import * as tasks from "@/server/tasks";
import * as views from "@/server/views";
import { ctxOf, expectCode, makeCompany, PW, versionOf } from "./helpers";

let C: Awaited<ReturnType<typeof makeCompany>>;
beforeAll(async () => {
  C = await makeCompany();
});

const t0 = today();
const board = () => projects.getBoard(C.ctx.admin, "WEB");
const sprintOf = async (taskId: string) => (await board()).tasks.find((t) => t.id === taskId)!.sprintId;
const stateOf = async (sprintId: string) => (await board()).sprints.find((s) => s.id === sprintId)?.state;

describe("sprints", () => {
  it("only people who manage projects create, start, complete and delete sprints", async () => {
    for (const who of [C.ctx.member, C.ctx.viewer]) await expectCode(sprints.createSprint(who, { projectId: C.projectId }), "forbidden");
    const { sprintId, name } = await sprints.createSprint(C.ctx.manager, { projectId: C.projectId });
    expect(name).toBe("Sprint 1");
    for (const who of [C.ctx.member, C.ctx.viewer]) {
      await expectCode(sprints.startSprint(who, { sprintId, startDate: t0, endDate: addDays(t0, 13) }), "forbidden");
      await expectCode(sprints.updateSprint(who, { sprintId, name: "x" }), "forbidden");
      await expectCode(sprints.deleteSprint(who, { sprintId }), "forbidden");
      await expectCode(sprints.completeSprint(who, { sprintId }), "forbidden");
    }
    await sprints.deleteSprint(C.ctx.manager, { sprintId });
  });

  it("numbers new sprints and refuses an end date before the start", async () => {
    const a = await sprints.createSprint(C.ctx.admin, { projectId: C.projectId, name: "  Kasım  " });
    expect(a.name).toBe("Kasım");
    await expectCode(sprints.createSprint(C.ctx.admin, { projectId: C.projectId, startDate: t0, endDate: addDays(t0, -1) }), "invalid");
    await expectCode(sprints.startSprint(C.ctx.admin, { sprintId: a.sprintId, startDate: t0, endDate: addDays(t0, -1) }), "invalid");
    expect((await sprints.createSprint(C.ctx.admin, { projectId: C.projectId })).name).toMatch(/^Sprint \d+$/);
  });

  it("a member plans their own task into a sprint, which shows in its history; tasks cannot go into another project's sprint", async () => {
    const { sprintId } = await sprints.createSprint(C.ctx.admin, { projectId: C.projectId });
    const { sprintId: secretSprint } = await sprints.createSprint(C.ctx.admin, { projectId: C.secretId });
    await tasks.updateTask(C.ctx.member2, { taskId: C.taskId, version: await versionOf(C.ctx.admin, C.key), sprintId });
    expect(await sprintOf(C.taskId)).toBe(sprintId);
    const d = await tasks.getTaskDetail(C.ctx.admin, C.key);
    expect(d.activity.some((a) => a.type === "field" && a.data.field === "sprintId" && a.data.to === sprintId)).toBe(true);
    expect(d.sprints.map((s) => s.id)).toContain(sprintId);
    await expectCode(tasks.updateTask(C.ctx.admin, { taskId: C.taskId, version: await versionOf(C.ctx.admin, C.key), sprintId: secretSprint }), "not_found");
    await expectCode(tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "x", sprintId: secretSprint }), "not_found");
    // Back to the backlog.
    await tasks.updateTask(C.ctx.member2, { taskId: C.taskId, version: await versionOf(C.ctx.admin, C.key), sprintId: null });
    expect(await sprintOf(C.taskId)).toBeNull();
  });

  it("one sprint at a time; completing it moves unfinished tasks on and keeps done ones as its record", async () => {
    const one = await sprints.createSprint(C.ctx.admin, { projectId: C.projectId, name: "Bir" });
    const two = await sprints.createSprint(C.ctx.admin, { projectId: C.projectId, name: "İki" });
    const open = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "Bitmeyen iş", sprintId: one.sprintId });
    const done = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, columnId: C.cols[3].id, title: "Biten iş", sprintId: one.sprintId });

    await expectCode(sprints.completeSprint(C.ctx.admin, { sprintId: one.sprintId }), "sprint_state");
    await sprints.startSprint(C.ctx.admin, { sprintId: one.sprintId, startDate: t0, endDate: addDays(t0, 13), goal: "Hedef" });
    expect(await stateOf(one.sprintId)).toBe("active");
    await expectCode(sprints.startSprint(C.ctx.admin, { sprintId: two.sprintId, startDate: t0, endDate: addDays(t0, 13) }), "sprint_active");
    await expectCode(sprints.startSprint(C.ctx.admin, { sprintId: one.sprintId, startDate: t0, endDate: addDays(t0, 13) }), "sprint_state");
    await expectCode(sprints.deleteSprint(C.ctx.admin, { sprintId: one.sprintId }), "sprint_state");
    // A copy joins the original's open sprint.
    const copy = await tasks.copyTask(C.ctx.admin, { taskId: open.taskId });
    expect(await sprintOf(copy.taskId)).toBe(one.sprintId);

    // Unfinished work may only move to a planned sprint of the same project.
    const { sprintId: secretSprint } = await sprints.createSprint(C.ctx.admin, { projectId: C.secretId });
    await expectCode(sprints.completeSprint(C.ctx.admin, { sprintId: one.sprintId, moveTo: secretSprint }), "not_found");
    await expectCode(sprints.completeSprint(C.ctx.admin, { sprintId: one.sprintId, moveTo: one.sprintId }), "sprint_state");

    const r = await sprints.completeSprint(C.ctx.admin, { sprintId: one.sprintId, moveTo: two.sprintId });
    expect(r.moved).toBe(2);
    expect(await stateOf(one.sprintId)).toBe("closed");
    expect(await sprintOf(open.taskId)).toBe(two.sprintId);
    expect(await sprintOf(copy.taskId)).toBe(two.sprintId);
    expect(await sprintOf(done.taskId)).toBe(one.sprintId);
    expect((await exportCsv(C.ctx.admin, "WEB", () => "", ["k"])).split("\r\n").find((l) => l.includes("Biten iş"))).toMatch(/"Bir"$/);

    // A completed sprint takes no new tasks and cannot be deleted or restarted.
    await expectCode(tasks.updateTask(C.ctx.admin, { taskId: open.taskId, version: await versionOf(C.ctx.admin, open.key), sprintId: one.sprintId }), "sprint_state");
    await expectCode(sprints.deleteSprint(C.ctx.admin, { sprintId: one.sprintId }), "sprint_state");
    await expectCode(sprints.startSprint(C.ctx.admin, { sprintId: one.sprintId, startDate: t0, endDate: t0 }), "sprint_state");
    // Copying a task of a closed sprint puts the copy in the backlog.
    expect(await sprintOf((await tasks.copyTask(C.ctx.admin, { taskId: done.taskId })).taskId)).toBeNull();

    // Now the next sprint can start; completing it without a target sends unfinished work to the backlog.
    await sprints.startSprint(C.ctx.admin, { sprintId: two.sprintId, startDate: t0, endDate: addDays(t0, 6) });
    await sprints.completeSprint(C.ctx.admin, { sprintId: two.sprintId });
    expect(await sprintOf(open.taskId)).toBeNull();
  });

  it("deleting a planned sprint returns its tasks to the backlog", async () => {
    const sp = await sprints.createSprint(C.ctx.admin, { projectId: C.projectId });
    const t = await tasks.createTask(C.ctx.member, { projectId: C.projectId, title: "Planlı iş", sprintId: sp.sprintId });
    await sprints.deleteSprint(C.ctx.admin, { sprintId: sp.sprintId });
    expect(await sprintOf(t.taskId)).toBeNull();
    expect(await stateOf(sp.sprintId)).toBeUndefined();
  });

  it("counts days for the countdown", () => {
    expect(daysBetween("2026-11-22", "2026-12-06")).toBe(14);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-11-22", "2026-11-20")).toBe(-2);
  });
});

describe("burndown", () => {
  const at = (iso: string) => new Date(iso);

  it("counts work from the day it joined to the day it was finished, in the app time zone", () => {
    const r = sprints.burndown(
      { startDate: "2026-11-09", endDate: "2026-11-13" },
      [
        // Finished 00:30 on the 11th in Istanbul (still the 10th in UTC).
        { estimate: 5, joinedAt: at("2026-11-01T09:00:00Z"), completedAt: at("2026-11-10T21:30:00Z") },
        { estimate: 3, joinedAt: at("2026-11-01T09:00:00Z"), completedAt: null },
        // Added to the sprint on its second day.
        { estimate: 2, joinedAt: at("2026-11-10T09:00:00Z"), completedAt: null },
        // No estimate: counts as zero points.
        { estimate: null, joinedAt: at("2026-11-01T09:00:00Z"), completedAt: at("2026-11-09T10:00:00Z") },
      ],
      at("2026-11-11T12:00:00Z"),
    );
    expect(r.unit).toBe("points");
    expect(r.days.map((d) => d.remaining)).toEqual([8, 10, 5, null, null]);
    expect(r.days.map((d) => d.ideal)).toEqual([8, 6, 4, 2, 0]);
    expect({ total: r.total, remaining: r.remaining, done: r.done, count: r.count, behind: r.behind }).toEqual({ total: 10, remaining: 5, done: 2, count: 4, behind: 1 });
  });

  it("counts tasks when nothing is estimated, and runs past an overdue end date", () => {
    const joinedAt = at("2026-11-01T09:00:00Z");
    const r = sprints.burndown(
      { startDate: "2026-11-09", endDate: "2026-11-10" },
      [
        { estimate: null, joinedAt, completedAt: null },
        { estimate: 0, joinedAt, completedAt: at("2026-11-12T08:00:00Z") },
      ],
      at("2026-11-12T12:00:00Z"),
    );
    expect(r.unit).toBe("tasks");
    expect(r.days.map((d) => [d.date, d.remaining, d.ideal])).toEqual([
      ["2026-11-09", 2, 2],
      ["2026-11-10", 2, 0],
      ["2026-11-11", 2, 0],
      ["2026-11-12", 1, 0],
    ]);
    expect(r.behind).toBe(1);
  });

  it("a task finished and reopened counts as done on the days it was done", () => {
    const joinedAt = at("2026-11-01T09:00:00Z");
    const r = sprints.burndown(
      { startDate: "2026-11-09", endDate: "2026-11-13" },
      [
        // Done on the 10th, reopened on the 12th: open again now, so completedAt is null.
        { estimate: 3, joinedAt, completedAt: null, doneChanges: [{ at: at("2026-11-10T10:00:00Z"), done: true }, { at: at("2026-11-12T10:00:00Z"), done: false }] },
        // Created done, reopened on the 10th, done again the same day: done on every day.
        { estimate: 2, joinedAt, completedAt: at("2026-11-10T15:00:00Z"), doneChanges: [{ at: at("2026-11-10T09:00:00Z"), done: false }, { at: at("2026-11-10T15:00:00Z"), done: true }] },
      ],
      at("2026-11-13T12:00:00Z"),
    );
    expect(r.days.map((d) => d.remaining)).toEqual([3, 0, 0, 3, 3]);
    expect({ remaining: r.remaining, done: r.done }).toEqual({ remaining: 3, done: 1 });
  });

  it("Overview shows each running sprint of the projects you can see, using task history for scope added later", async () => {
    const D = await makeCompany();
    const db = await getDb();
    const longAgo = new Date(Date.now() - 10 * 864e5);
    const sp = await sprints.createSprint(D.ctx.admin, { projectId: D.projectId, name: "Koşan" });
    const inSprint = await tasks.createTask(D.ctx.admin, { projectId: D.projectId, title: "Baştan beri", estimate: 5, sprintId: sp.sprintId });
    const finished = await tasks.createTask(D.ctx.admin, { projectId: D.projectId, columnId: D.cols[3].id, title: "Bugün bitti", estimate: 2, sprintId: sp.sprintId });
    const added = await tasks.createTask(D.ctx.admin, { projectId: D.projectId, title: "Sonradan eklendi", estimate: 3 });
    await db.update(s.tasks).set({ createdAt: longAgo }).where(inArray(s.tasks.id, [inSprint.taskId, finished.taskId, added.taskId]));
    await tasks.updateTask(D.ctx.admin, { taskId: added.taskId, version: await versionOf(D.ctx.admin, added.key), sprintId: sp.sprintId });
    await db
      .update(s.activities)
      .set({ createdAt: new Date(Date.now() - 864e5) })
      .where(and(eq(s.activities.taskId, added.taskId), eq(s.activities.type, "field")));
    await sprints.startSprint(D.ctx.admin, { sprintId: sp.sprintId, startDate: addDays(t0, -2), endDate: addDays(t0, 3) });
    // A running sprint in the restricted project, and a planned one that must not show.
    const secret = await sprints.createSprint(D.ctx.admin, { projectId: D.secretId, name: "Gizli sprint" });
    await sprints.startSprint(D.ctx.admin, { sprintId: secret.sprintId, startDate: t0, endDate: addDays(t0, 6) });
    await sprints.createSprint(D.ctx.admin, { projectId: D.projectId, name: "Sıradaki" });

    const report = (await views.dashboard(D.ctx.manager, D.projectId)).sprints;
    expect(report.map((r) => r.sprint.name)).toEqual(["Koşan"]);
    expect(report[0].days.slice(0, 3).map((d) => d.remaining)).toEqual([7, 10, 8]);
    expect(report[0]).toMatchObject({ unit: "points", total: 10, remaining: 8, done: 1, count: 3, projectKey: "WEB" });

    // Finished yesterday and reopened today: yesterday stays done (read from the move history).
    await tasks.moveTask(D.ctx.admin, { taskId: inSprint.taskId, columnId: D.cols[3].id, index: 0, version: await versionOf(D.ctx.admin, inSprint.key) });
    await db
      .update(s.activities)
      .set({ createdAt: new Date(Date.now() - 864e5) })
      .where(and(eq(s.activities.taskId, inSprint.taskId), eq(s.activities.type, "moved")));
    await tasks.moveTask(D.ctx.admin, { taskId: inSprint.taskId, columnId: D.cols[1].id, index: 0, version: await versionOf(D.ctx.admin, inSprint.key) });
    const reopened = (await views.dashboard(D.ctx.manager, D.projectId)).sprints[0];
    expect(reopened.days.slice(0, 3).map((d) => d.remaining)).toEqual([7, 5, 8]);
    expect((await views.dashboard(D.ctx.admin)).sprints.map((r) => r.sprint.name)).toEqual(["Gizli sprint", "Koşan"]);

    // Someone who may view reports but is not on the restricted project does not see its sprint.
    const { roleId } = await admin.createRole(D.ctx.admin, { name: "Raporcu", permissions: ["reports.view"] });
    const { userId } = await admin.createUser(D.ctx.admin, { name: "Rapor Okuyan", email: `rapor-${D.tag}@x.test`, roleId, locale: "tr", mode: "password", password: PW });
    expect((await views.dashboard(await ctxOf(userId))).sprints.map((r) => r.sprint.name)).toEqual(["Koşan"]);
  });
});
