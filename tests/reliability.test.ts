import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, schema as s } from "@/db";
import { addDays, today, weekStart } from "@/lib/dates";
import * as admin from "@/server/admin";
import * as projects from "@/server/projects";
import * as tasks from "@/server/tasks";
import * as views from "@/server/views";
import { expectCode, makeCompany } from "./helpers";

let C: Awaited<ReturnType<typeof makeCompany>>;
beforeAll(async () => {
  C = await makeCompany();
});

const column = async (columnId: string) =>
  (await projects.getBoard(C.ctx.admin, "WEB")).tasks.filter((t) => t.columnId === columnId);

describe("card order", () => {
  it("keeps the dropped order after many drops into the same slot", async () => {
    const col = C.cols[2].id;
    for (const title of ["alt", "üst"]) await tasks.createTask(C.ctx.admin, { projectId: C.projectId, columnId: col, title });
    // Each drop between the top card and the one below halves the gap; 80 drops exhaust float precision.
    for (let i = 0; i < 80; i++) {
      const { taskId } = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: `kart ${i}` });
      const v = (await projects.getBoard(C.ctx.admin, "WEB")).tasks.find((t) => t.id === taskId)!.version;
      await tasks.moveTask(C.ctx.admin, { taskId, version: v, columnId: col, index: 1 });
      expect((await column(col)).map((t) => t.title).slice(0, 2)).toEqual(["üst", `kart ${i}`]);
    }
    const positions = (await column(col)).map((t) => t.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("two people moving the same card: the second gets a conflict, not a silent overwrite", async () => {
    const { taskId, key } = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "Aynı kart" });
    const v = (await tasks.getTaskDetail(C.ctx.admin, key)).task.version;
    const results = await Promise.allSettled([
      tasks.moveTask(C.ctx.admin, { taskId, version: v, columnId: C.cols[1].id, index: 0 }),
      tasks.moveTask(C.ctx.manager, { taskId, version: v, columnId: C.cols[3].id, index: 0 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const d = await tasks.getTaskDetail(C.ctx.admin, key);
    expect(d.task.version).toBe(v + 1);
    expect(d.activity.filter((a) => a.type === "moved")).toHaveLength(1);
  });
});

describe("columns", () => {
  it("a column with tasks cannot be deleted; the tasks stay", async () => {
    await projects.addColumn(C.ctx.manager, { projectId: C.projectId, name: "Test", category: "doing", wipLimit: null });
    const col = (await projects.projectColumns(C.projectId)).find((c) => c.name === "Test")!;
    const { key } = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, columnId: col.id, title: "Sütunda" });
    await expectCode(projects.deleteColumn(C.ctx.manager, { columnId: col.id }), "column_not_empty");
    expect((await tasks.getTaskDetail(C.ctx.admin, key)).task.columnId).toBe(col.id);
  });
});

describe("Turkish and Unicode text", () => {
  it("keeps labels as written: English capitals do not turn into dotless ı", async () => {
    const { key } = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "Etiket", labels: ["API", "api", "CI/CD", "İzmir", "izmir"] });
    expect((await tasks.getTaskDetail(C.ctx.admin, key)).task.labels).toEqual(["API", "CI/CD", "İzmir"]);
    expect((await tasks.searchTasks(C.ctx.admin, "ci/cd")).map((t) => t.key)).toContain(key);
  });
  it("stores a maximum-length description with combining marks and emoji and finds it", async () => {
    const tail = "Çalışma ağacı 🚀 İstanbul";
    // The limit counts characters (code points), so the emoji counts once.
    const description = "ş".repeat(20000 - [...tail].length) + tail;
    const { key } = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "Uzun", description });
    expect((await tasks.getTaskDetail(C.ctx.admin, key)).task.description).toBe(description);
    expect((await tasks.searchTasks(C.ctx.admin, "istanbul")).map((t) => t.key)).toContain(key);
    await expectCode(tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "Fazla", description: description + "x" }), "invalid");
  });
});

describe("people who leave", () => {
  it("deactivating someone hands their open tasks back to the team; done work keeps their name", async () => {
    const { userId } = await admin.createUser(C.ctx.admin, {
      name: "Ayrılan Kişi",
      email: `leaver-${C.tag}@x.test`,
      roleId: C.roleId("member"),
      locale: "tr",
      mode: "password",
      password: "Parola12345",
    });
    const open = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "Açık iş", assigneeIds: [userId, C.ids.member2] });
    const solo = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: "Tek başına", assigneeIds: [userId] });
    const done = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, columnId: C.cols[3].id, title: "Bitmiş", assigneeIds: [userId] });
    await admin.updateUser(C.ctx.admin, { userId, active: false });

    const assignees = async (key: string) => (await tasks.getTaskDetail(C.ctx.admin, key)).task.assigneeIds;
    expect(await assignees(open.key)).toEqual([C.ids.member2]);
    expect(await assignees(solo.key)).toEqual([]);
    expect(await assignees(done.key)).toEqual([userId]);
    const history = (await tasks.getTaskDetail(C.ctx.admin, solo.key)).activity;
    expect(history.some((a) => a.type === "unassigned" && (a.data as { userId: string }).userId === userId)).toBe(true);
    // The board can still name the person on finished cards.
    const board = await projects.getBoard(C.ctx.admin, "WEB");
    expect(board.everyone.find((p) => p.id === userId)?.name).toBe("Ayrılan Kişi");
    expect(board.people.some((p) => p.id === userId)).toBe(false);
  });
});

describe("time zone (Europe/Istanbul)", () => {
  it("today() switches at Istanbul midnight, not UTC midnight", () => {
    expect(today(0, new Date("2026-11-22T20:59:00Z"))).toBe("2026-11-22");
    expect(today(0, new Date("2026-11-22T21:00:00Z"))).toBe("2026-11-23");
    expect(today(1, new Date("2026-11-22T21:30:00Z"))).toBe("2026-11-24");
  });
  it("the done-per-week chart counts a task finished just after Monday midnight in Istanbul", async () => {
    const { taskId } = await tasks.createTask(C.ctx.admin, { projectId: C.projectId, columnId: C.cols[3].id, title: "Gece yarısı" });
    const firstWeek = addDays(weekStart(today()), -7 * 7);
    const before = (await views.dashboard(C.ctx.manager)).perWeek[0];
    expect(before.week).toBe(firstWeek);
    // 00:30 Monday in Istanbul is 21:30 Sunday in UTC.
    const db = await getDb();
    await db.update(s.tasks).set({ completedAt: new Date(`${firstWeek}T00:30:00+03:00`) }).where(eq(s.tasks.id, taskId));
    expect((await views.dashboard(C.ctx.manager)).perWeek[0].done).toBe(before.done + 1);
  });
});

describe("many tasks", () => {
  it("dashboard and search report the real totals even when the list is capped", async () => {
    for (let i = 0; i < 55; i++)
      await tasks.createTask(C.ctx.admin, { projectId: C.projectId, title: `Gecikmiş yığın ${i}`, dueDate: today(-2) });
    const dash = await views.dashboard(C.ctx.manager);
    expect(dash.overdue.length).toBe(50);
    expect(dash.overdueTotal).toBeGreaterThanOrEqual(55);
    const found = await tasks.searchTasks(C.ctx.admin, "gecikmiş yığın");
    expect(found.length).toBe(50);
    expect(found[0].total).toBe(55);
    const rest = await tasks.searchTasks(C.ctx.admin, "gecikmiş yığın", 1);
    expect(rest.map((t) => t.total)).toEqual([55, 55, 55, 55, 55]);
    expect(new Set([...found, ...rest].map((t) => t.id)).size).toBe(55);
  });
});
