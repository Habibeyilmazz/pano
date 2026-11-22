import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, schema as s } from "@/db";
import * as account from "@/server/account";
import * as admin from "@/server/admin";
import { exportCsv } from "@/server/export";
import * as notifications from "@/server/notifications";
import * as projects from "@/server/projects";
import * as sprints from "@/server/sprints";
import * as tasks from "@/server/tasks";
import * as views from "@/server/views";
import { expectCode, makeCompany, PW, versionOf } from "./helpers";

// Company B's admin holds every permission, so these tests show that permissions never cross companies.
let A: Awaited<ReturnType<typeof makeCompany>>;
let B: Awaited<ReturnType<typeof makeCompany>>;
let aItemId: string;
let aCustomRoleId: string;
let aNotificationId: string;
let aSprintId: string;
let aActiveSprintId: string;
let bSprintId: string;

beforeAll(async () => {
  A = await makeCompany("Alfa A.Ş.");
  B = await makeCompany("Beta Ltd.");
  await tasks.addChecklistItem(A.ctx.admin, { taskId: A.taskId, text: "madde" });
  const db = await getDb();
  aItemId = (await db.select().from(s.checklistItems).where(eq(s.checklistItems.taskId, A.taskId)))[0].id;
  aCustomRoleId = (await admin.createRole(A.ctx.admin, { name: "Özel", permissions: ["tasks.create"] })).roleId;
  aNotificationId = (await notifications.listNotifications(A.ctx.member2))[0].id;
  aSprintId = (await sprints.createSprint(A.ctx.admin, { projectId: A.projectId })).sprintId;
  aActiveSprintId = (await sprints.createSprint(A.ctx.admin, { projectId: A.projectId })).sprintId;
  await sprints.startSprint(A.ctx.admin, { sprintId: aActiveSprintId, startDate: "2026-11-23", endDate: "2026-12-06" });
  bSprintId = (await sprints.createSprint(B.ctx.admin, { projectId: B.projectId })).sprintId;
  await sprints.startSprint(B.ctx.admin, { sprintId: bSprintId, startDate: "2026-11-23", endDate: "2026-12-06" });
});

const b = () => B.ctx.admin;

/** One entry per server action in src/app/actions.ts: what a company B admin tries against company A. */
const cases: Record<string, () => Promise<void>> = {
  signup: async () => {
    // Signing up creates a new, separate company; it cannot join A, even with A's admin email.
    await expectCode(account.signupCompany({ company: "Xx", name: "X", email: A.ctx.admin.email, password: PW, locale: "tr" }), "email_taken");
  },
  login: async () => {
    const r = await account.login({ email: `member-${B.tag}@x.test`, password: PW });
    expect(r.userId).toBe(B.ids.member);
  },
  acceptInvite: async () => {
    await expectCode(account.acceptInvite({ token: "x".repeat(43), password: PW + "x" }), "invite_invalid");
  },
  logout: async () => {
    // Logout only deletes the session whose token the caller holds.
    await account.deleteSession("not-a-real-token");
    expect(await account.userIdForSession((await account.login({ email: A.ctx.admin.email, password: PW })).token)).toBe(A.ids.admin);
  },
  setLocale: async () => {
    await account.updateProfile(b(), { locale: "en", userId: A.ids.admin });
    const db = await getDb();
    expect((await db.select().from(s.users).where(eq(s.users.id, A.ids.admin)))[0].locale).toBe("tr");
    await account.updateProfile(b(), { locale: "tr" });
  },
  changePassword: async () => {
    await expectCode(account.changePassword(b(), { current: "wrong-one-123", password: "Yepyeni12345", userId: A.ids.admin }), "bad_credentials");
  },
  updateProfile: async () => {
    await account.updateProfile(b(), { name: "Hacker", userId: A.ids.member });
    const db = await getDb();
    expect((await db.select().from(s.users).where(eq(s.users.id, A.ids.member)))[0].name).not.toBe("Hacker");
    await account.updateProfile(b(), { name: "Yönetici" });
  },
  createUser: async () => {
    await expectCode(
      admin.createUser(b(), { name: "X", email: "x-cross@x.test", roleId: A.roleId("admin"), locale: "tr", mode: "invite" }),
      "not_found",
    );
  },
  updateUser: async () => {
    await expectCode(admin.updateUser(b(), { userId: A.ids.member, active: false }), "not_found");
    await expectCode(admin.updateUser(b(), { userId: B.ids.member, roleId: A.roleId("admin") }), "not_found");
  },
  resetPassword: async () => {
    await expectCode(admin.resetPassword(b(), { userId: A.ids.admin, mode: "invite" }), "not_found");
  },
  createRole: async () => {
    await admin.createRole(b(), { name: "B rolü", permissions: [] });
    expect((await admin.listRoles(A.ctx.admin)).map((r) => r.name)).not.toContain("B rolü");
  },
  updateRole: async () => {
    await expectCode(admin.updateRole(b(), { roleId: aCustomRoleId, name: "xx", permissions: [] }), "not_found");
  },
  deleteRole: async () => {
    await expectCode(admin.deleteRole(b(), { roleId: aCustomRoleId }), "not_found");
  },
  createProject: async () => {
    await expectCode(projects.createProject(b(), { key: "ZZZ", name: "Zz", restricted: true, memberIds: [A.ids.member] }), "not_found");
  },
  updateProject: async () => {
    await expectCode(projects.updateProject(b(), { projectId: A.projectId, name: "Ele geçirildi" }), "not_found");
    await expectCode(projects.updateProject(b(), { projectId: B.projectId, name: "Web", memberIds: [A.ids.member] }), "not_found");
  },
  addColumn: async () => {
    await expectCode(projects.addColumn(b(), { projectId: A.projectId, name: "x", category: "todo", wipLimit: null }), "not_found");
  },
  updateColumn: async () => {
    await expectCode(projects.updateColumn(b(), { columnId: A.cols[0].id, name: "x", category: "todo", wipLimit: null }), "not_found");
  },
  moveColumn: async () => {
    await expectCode(projects.moveColumn(b(), { columnId: A.cols[0].id, dir: 1 }), "not_found");
  },
  deleteColumn: async () => {
    await expectCode(projects.deleteColumn(b(), { columnId: A.cols[1].id }), "not_found");
  },
  createSprint: async () => {
    await expectCode(sprints.createSprint(b(), { projectId: A.projectId }), "not_found");
  },
  updateSprint: async () => {
    await expectCode(sprints.updateSprint(b(), { sprintId: aSprintId, name: "Ele geçirildi" }), "not_found");
  },
  startSprint: async () => {
    await expectCode(sprints.startSprint(b(), { sprintId: aSprintId, startDate: "2026-11-23", endDate: "2026-12-06" }), "not_found");
  },
  completeSprint: async () => {
    await expectCode(sprints.completeSprint(b(), { sprintId: aActiveSprintId }), "not_found");
    await expectCode(sprints.completeSprint(b(), { sprintId: bSprintId, moveTo: aSprintId }), "not_found");
  },
  deleteSprint: async () => {
    await expectCode(sprints.deleteSprint(b(), { sprintId: aSprintId }), "not_found");
  },
  createTask: async () => {
    await expectCode(tasks.createTask(b(), { projectId: A.projectId, title: "x" }), "not_found");
    await expectCode(tasks.createTask(b(), { projectId: B.projectId, title: "x", sprintId: aSprintId }), "not_found");
    await expectCode(tasks.createTask(b(), { projectId: B.projectId, columnId: A.cols[0].id, title: "x" }), "not_found");
    await expectCode(tasks.createTask(b(), { projectId: B.projectId, title: "x", assigneeIds: [A.ids.member] }), "not_found");
  },
  updateTask: async () => {
    await expectCode(tasks.updateTask(b(), { taskId: A.taskId, version: 1, title: "x" }), "not_found");
    await expectCode(tasks.updateTask(b(), { taskId: B.taskId, version: await versionOf(b(), B.key), sprintId: aSprintId }), "not_found");
  },
  moveTask: async () => {
    await expectCode(tasks.moveTask(b(), { taskId: A.taskId, version: 1, columnId: A.cols[1].id, index: 0 }), "not_found");
    await expectCode(tasks.moveTask(b(), { taskId: B.taskId, version: 1, columnId: A.cols[1].id, index: 0 }), "not_found");
  },
  deleteTask: async () => {
    await expectCode(tasks.deleteTask(b(), { taskId: A.taskId }), "not_found");
  },
  copyTask: async () => {
    await expectCode(tasks.copyTask(b(), { taskId: A.taskId }), "not_found");
  },
  assignTask: async () => {
    await expectCode(tasks.assignTask(b(), { taskId: A.taskId, userId: B.ids.admin }), "not_found");
    await expectCode(tasks.assignTask(b(), { taskId: B.taskId, userId: A.ids.member }), "not_found");
  },
  unassignTask: async () => {
    await expectCode(tasks.unassignTask(b(), { taskId: A.taskId, userId: A.ids.member2 }), "not_found");
  },
  addChecklistItem: async () => {
    await expectCode(tasks.addChecklistItem(b(), { taskId: A.taskId, text: "x" }), "not_found");
  },
  toggleChecklistItem: async () => {
    await expectCode(tasks.toggleChecklistItem(b(), { itemId: aItemId, done: true }), "not_found");
  },
  deleteChecklistItem: async () => {
    await expectCode(tasks.deleteChecklistItem(b(), { itemId: aItemId }), "not_found");
  },
  addComment: async () => {
    await expectCode(tasks.addComment(b(), { taskId: A.taskId, body: "merhaba" }), "not_found");
  },
  markNotificationsRead: async () => {
    await notifications.markNotificationsRead(b(), { ids: [aNotificationId] });
    await notifications.markNotificationsRead(b(), {});
    const n = (await notifications.listNotifications(A.ctx.member2)).find((x) => x.id === aNotificationId);
    expect(n?.readAt).toBeNull();
  },
};

describe("tenant isolation: every server action", () => {
  it("has a cross-company case for each action in src/app/actions.ts", () => {
    const src = readFileSync("src/app/actions.ts", "utf8");
    const actions = [...src.matchAll(/export async function (\w+)Action\(/g)].map((m) => m[1]).sort();
    expect(actions.length).toBeGreaterThan(20);
    expect(Object.keys(cases).sort()).toEqual(actions);
  });

  for (const [name, fn] of Object.entries(cases)) it(name, fn);

  it("left company A's data untouched", async () => {
    const d = await tasks.getTaskDetail(A.ctx.admin, A.key);
    expect(d.task.title).toBe("İstanbul ofisi taşınması");
    expect(d.task.version).toBe(1);
    expect(d.task.assigneeIds).toEqual([A.ids.member2]);
    expect(d.checklist).toHaveLength(1);
    expect(d.checklist[0].done).toBe(false);
    expect(d.comments).toHaveLength(0);
    expect((await projects.projectColumns(A.projectId)).map((c) => c.name)).toEqual([null, null, null, null]);
    expect((await admin.listUsers(A.ctx.admin)).every((u) => u.active)).toBe(true);
    const sp = (await projects.getBoard(A.ctx.admin, "WEB")).sprints;
    expect(sp.map((x) => [x.name, x.state])).toEqual([
      ["Sprint 1", "planned"],
      ["Sprint 2", "active"],
    ]);
  });
});

describe("tenant isolation: every read used by a page", () => {
  it("board, task detail and CSV export show only the caller's company", async () => {
    // Both companies have a project with key WEB and a task WEB-1.
    const board = await projects.getBoard(b(), "WEB");
    expect(board.project.workspaceId).toBe(B.workspaceId);
    expect(board.tasks.map((t) => t.id)).not.toContain(A.taskId);
    expect(board.people.map((p) => p.id)).not.toContain(A.ids.admin);
    expect(board.sprints.map((x) => x.id)).toEqual([bSprintId]);
    const detail = await tasks.getTaskDetail(b(), "WEB-1");
    expect(detail.task.id).toBe(B.taskId);
    expect(detail.people.map((p) => p.id)).not.toContain(A.ids.admin);
    expect(detail.sprints.map((x) => x.id)).toEqual([bSprintId]);
    const csv = await exportCsv(b(), "WEB", () => "", ["k"]);
    expect(csv).not.toContain(A.taskId);
  });

  it("lists, search, views and notifications", async () => {
    expect((await projects.listProjects(b())).every((p) => p.workspaceId === B.workspaceId)).toBe(true);
    expect((await tasks.searchTasks(b(), "istanbul")).map((t) => t.id)).toEqual([B.taskId]);
    expect((await admin.listUsers(b())).map((u) => u.id)).not.toContain(A.ids.admin);
    expect((await admin.listRoles(b())).map((r) => r.id)).not.toContain(aCustomRoleId);
    expect(JSON.stringify(await admin.listAudit(b()))).not.toContain(A.ids.admin);
    const team = await views.team(b());
    expect(team.map((p) => p.id)).not.toContain(A.ids.member2);
    expect(JSON.stringify(await views.myWork(b()))).not.toContain(A.taskId);
    const dash = JSON.stringify(await views.dashboard(b()));
    expect(dash).not.toContain(A.taskId);
    expect(dash).not.toContain(aActiveSprintId);
    expect(dash).toContain(bSprintId);
    expect(JSON.stringify(await notifications.listNotifications(b()))).not.toContain(A.taskId);
  });

  it("refuses A's ids in page parameters", async () => {
    await expectCode(views.person(b(), A.ids.member2), "not_found");
    await expectCode(views.team(b(), A.projectId), "not_found");
    await expectCode(views.dashboard(b(), A.projectId), "not_found");
    expect((await projects.getBoard(b(), "SEC")).project.workspaceId).toBe(B.workspaceId);
  });
});
