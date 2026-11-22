import { beforeAll, describe, expect, it } from "vitest";
import { addDays, daysBetween, today } from "@/lib/dates";
import { exportCsv } from "@/server/export";
import * as projects from "@/server/projects";
import * as sprints from "@/server/sprints";
import * as tasks from "@/server/tasks";
import { expectCode, makeCompany, versionOf } from "./helpers";

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
