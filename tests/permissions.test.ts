import { beforeAll, describe, expect, it } from "vitest";
import * as account from "@/server/account";
import * as admin from "@/server/admin";
import { loadCtx } from "@/server/ctx";
import * as projects from "@/server/projects";
import * as tasks from "@/server/tasks";
import * as views from "@/server/views";
import { ctxOf, expectCode, makeCompany, PW, versionOf } from "./helpers";

let C: Awaited<ReturnType<typeof makeCompany>>;
beforeAll(async () => {
  C = await makeCompany();
});

describe("viewer is read-only", () => {
  it("cannot create, edit, move, assign, comment or delete", async () => {
    const v = C.ctx.viewer;
    await expectCode(tasks.createTask(v, { projectId: C.projectId, title: "x" }), "forbidden");
    await expectCode(tasks.updateTask(v, { taskId: C.taskId, version: 1, title: "x" }), "forbidden");
    await expectCode(tasks.moveTask(v, { taskId: C.taskId, version: 1, columnId: C.cols[1].id, index: 0 }), "forbidden");
    await expectCode(tasks.assignTask(v, { taskId: C.taskId, userId: v.userId }), "forbidden");
    await expectCode(tasks.addComment(v, { taskId: C.taskId, body: "x" }), "forbidden");
    await expectCode(tasks.deleteTask(v, { taskId: C.taskId }), "forbidden");
    await expectCode(tasks.addChecklistItem(v, { taskId: C.taskId, text: "x" }), "forbidden");
    await expectCode(projects.createProject(v, { key: "VV", name: "x" }), "forbidden");
    await expectCode(admin.listUsers(v), "forbidden");
    await expectCode(views.dashboard(v), "forbidden");
  });
  it("can still read the board and task", async () => {
    expect((await projects.getBoard(C.ctx.viewer, "WEB")).tasks.length).toBeGreaterThan(0);
    expect((await tasks.getTaskDetail(C.ctx.viewer, C.key)).canEdit).toBe(false);
  });
});

describe("member", () => {
  it("assigns self and others, edits own and assigned tasks only", async () => {
    const m = C.ctx.member;
    const { taskId, key } = await tasks.createTask(m, { projectId: C.projectId, title: "Benim görevim" });
    await tasks.updateTask(m, { taskId, version: 1, title: "Yeni başlık" });
    // Someone else's task, not assigned: no edit.
    await expectCode(tasks.updateTask(m, { taskId: C.taskId, version: await versionOf(m, C.key), title: "x" }), "forbidden");
    // Assigning self grants edit rights.
    await tasks.assignTask(m, { taskId: C.taskId, userId: m.userId });
    await tasks.updateTask(m, { taskId: C.taskId, version: await versionOf(m, C.key), priority: "high" });
    await tasks.assignTask(m, { taskId, userId: C.ids.member2 });
    expect((await tasks.getTaskDetail(m, key)).task.assigneeIds).toContain(C.ids.member2);
    await expectCode(tasks.deleteTask(m, { taskId }), "forbidden");
    await tasks.unassignTask(m, { taskId: C.taskId, userId: m.userId });
  });
  it("cannot assign someone who cannot see the project", async () => {
    const { taskId } = await tasks.createTask(C.ctx.manager, { projectId: C.secretId, title: "Gizli iş" });
    await expectCode(tasks.assignTask(C.ctx.manager, { taskId, userId: C.ids.member }), "not_found");
    await tasks.assignTask(C.ctx.manager, { taskId, userId: C.ids.member2 });
  });
});

describe("manager", () => {
  it("edits any task, deletes tasks, manages columns, but not users or roles", async () => {
    const g = C.ctx.manager;
    const { taskId, key } = await tasks.createTask(C.ctx.member, { projectId: C.projectId, title: "Silinecek" });
    await tasks.updateTask(g, { taskId, version: await versionOf(g, key), title: "Müdür düzenledi" });
    await tasks.deleteTask(g, { taskId });
    await expectCode(tasks.getTaskDetail(g, key), "not_found");
    await projects.addColumn(g, { projectId: C.projectId, name: "Test", category: "doing", wipLimit: 2 });
    await expectCode(admin.listUsers(g), "forbidden");
    await expectCode(admin.createRole(g, { name: "xx", permissions: [] }), "forbidden");
    expect((await admin.listAudit(C.ctx.admin)).some((a) => a.action === "task.deleted")).toBe(true);
  });
});

describe("restricted projects", () => {
  it("are invisible to non-members, by key and by id", async () => {
    await expectCode(projects.getBoard(C.ctx.member, "SEC"), "not_found");
    await expectCode(tasks.createTask(C.ctx.member, { projectId: C.secretId, title: "x" }), "not_found");
    expect((await projects.listProjects(C.ctx.member)).map((p) => p.key)).toEqual(["WEB"]);
    expect((await projects.listProjects(C.ctx.member2)).map((p) => p.key).sort()).toEqual(["SEC", "WEB"]);
    expect((await projects.listProjects(C.ctx.manager)).length).toBe(2);
  });
});

describe("custom roles", () => {
  it("grant exactly the ticked permissions", async () => {
    const { roleId } = await admin.createRole(C.ctx.admin, { name: "Yorumcu", permissions: ["comments.create"] });
    const { userId } = await admin.createUser(C.ctx.admin, {
      name: "Yorumcu",
      email: `yorumcu-${C.tag}@x.test`,
      roleId,
      locale: "en",
      mode: "invite",
    });
    const u = await ctxOf(userId);
    await tasks.addComment(u, { taskId: C.taskId, body: "Bence iyi" });
    await expectCode(tasks.createTask(u, { projectId: C.projectId, title: "x" }), "forbidden");
    await admin.updateRole(C.ctx.admin, { roleId, name: "Yorumcu", permissions: ["comments.create", "tasks.create"] });
    await tasks.createTask(await ctxOf(userId), { projectId: C.projectId, title: "Artık açabilirim" });
    await expectCode(admin.deleteRole(C.ctx.admin, { roleId }), "role_in_use");
  });
  it("built-in roles cannot be edited or deleted", async () => {
    await expectCode(admin.updateRole(C.ctx.admin, { roleId: C.roleId("viewer"), name: "xx", permissions: ["tasks.delete"] }), "forbidden");
    await expectCode(admin.deleteRole(C.ctx.admin, { roleId: C.roleId("member") }), "forbidden");
  });
  it("cannot be used to escalate privileges", async () => {
    const { roleId } = await admin.createRole(C.ctx.admin, { name: "İK", permissions: ["users.manage"] });
    const { userId } = await admin.createUser(C.ctx.admin, { name: "İK", email: `ik-${C.tag}@x.test`, roleId, locale: "tr", mode: "invite" });
    const hr = await ctxOf(userId);
    // May manage people with fewer rights...
    await admin.createUser(hr, { name: "Yeni", email: `yeni-${C.tag}@x.test`, roleId: C.roleId("viewer"), locale: "tr", mode: "invite" });
    // ...but not hand out, or take over, rights it lacks.
    await expectCode(admin.updateUser(hr, { userId, roleId: C.roleId("admin") }), "forbidden");
    await expectCode(admin.createUser(hr, { name: "x", email: `x-${C.tag}@x.test`, roleId: C.roleId("admin"), locale: "tr", mode: "invite" }), "forbidden");
    await expectCode(admin.resetPassword(hr, { userId: C.ids.admin, mode: "invite" }), "forbidden");
    await expectCode(admin.updateUser(hr, { userId: C.ids.manager, active: false }), "forbidden");
  });
});

describe("user lifecycle", () => {
  it("deactivation ends sessions and blocks sign-in, history stays", async () => {
    const email = `member-${C.tag}@x.test`;
    const s = await account.login({ email, password: PW });
    expect(await account.userIdForSession(s.token)).toBe(C.ids.member);
    await admin.updateUser(C.ctx.admin, { userId: C.ids.member, active: false });
    expect(await account.userIdForSession(s.token)).toBeNull();
    expect(await loadCtx(C.ids.member)).toBeNull();
    await expectCode(account.login({ email, password: PW }), "bad_credentials");
    expect((await admin.listAudit(C.ctx.admin)).some((a) => a.action === "user.deactivated")).toBe(true);
    await admin.updateUser(C.ctx.admin, { userId: C.ids.member, active: true });
    await account.login({ email, password: PW });
  });
  it("role change ends sessions and is audited", async () => {
    const s = await account.login({ email: `viewer-${C.tag}@x.test`, password: PW });
    await admin.updateUser(C.ctx.admin, { userId: C.ids.viewer, roleId: C.roleId("member") });
    expect(await account.userIdForSession(s.token)).toBeNull();
    expect((await ctxOf(C.ids.viewer)).perms.has("tasks.create")).toBe(true);
    expect((await admin.listAudit(C.ctx.admin)).some((a) => a.action === "user.role_changed")).toBe(true);
    await admin.updateUser(C.ctx.admin, { userId: C.ids.viewer, roleId: C.roleId("viewer") });
  });
  it("keeps at least one active admin and admins cannot deactivate themselves", async () => {
    await expectCode(admin.updateUser(C.ctx.admin, { userId: C.ids.admin, roleId: C.roleId("member") }), "last_admin");
    await expectCode(admin.updateUser(C.ctx.admin, { userId: C.ids.admin, active: false }), "forbidden");
  });
  it("invite link sets the password once; temp password must be changed", async () => {
    const { userId, inviteToken } = await admin.createUser(C.ctx.admin, {
      name: "Davetli",
      email: `davet-${C.tag}@x.test`,
      roleId: C.roleId("member"),
      locale: "tr",
      mode: "invite",
    });
    await expectCode(account.login({ email: `davet-${C.tag}@x.test`, password: PW }), "bad_credentials");
    await expectCode(account.acceptInvite({ token: inviteToken!, password: "kisa" }), "weak_password");
    await account.acceptInvite({ token: inviteToken!, password: "DavetParola1" });
    await expectCode(account.acceptInvite({ token: inviteToken!, password: "DavetParola2" }), "invite_invalid");
    await account.login({ email: `davet-${C.tag}@x.test`, password: "DavetParola1" });

    await admin.resetPassword(C.ctx.admin, { userId, mode: "password", password: "GeciciParola9" });
    const ctx = await ctxOf(userId);
    expect(ctx.mustChangePassword).toBe(true);
    await account.login({ email: `davet-${C.tag}@x.test`, password: "GeciciParola9" });
    await expectCode(account.changePassword(ctx, { current: "GeciciParola9", password: "GeciciParola9" }), "weak_password");
    await account.changePassword(ctx, { current: "GeciciParola9", password: "KendiParolam7" });
    expect((await ctxOf(userId)).mustChangePassword).toBe(false);
  });
});
