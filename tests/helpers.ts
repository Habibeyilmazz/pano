import { expect } from "vitest";
import { AppError, type ErrorCode } from "@/lib/errors";
import * as account from "@/server/account";
import * as admin from "@/server/admin";
import { loadCtx, type Ctx } from "@/server/ctx";
import * as projects from "@/server/projects";
import * as tasks from "@/server/tasks";

export const PW = "Parola12345";
let n = 0;

export async function ctxOf(userId: string): Promise<Ctx> {
  return (await loadCtx(userId))!;
}

/** A company with one user per built-in role, a project, a restricted project and one task. */
export async function makeCompany(name = `Şirket ${++n}`) {
  const tag = `${Date.now().toString(36)}${++n}`;
  const signup = await account.signupCompany({ company: name, name: "Yönetici", email: `admin-${tag}@x.test`, password: PW, locale: "tr" });
  const adminCtx = await ctxOf(signup.userId);
  const roles = await admin.listRoles(adminCtx);
  const roleId = (b: string) => roles.find((r) => r.builtin === b)!.id;
  const mk = async (role: string, handle = role) => {
    const { userId } = await admin.createUser(adminCtx, {
      name: `${role} kişi`,
      email: `${handle}-${tag}@x.test`,
      roleId: roleId(role),
      locale: "tr",
      mode: "password",
      password: PW,
    });
    return userId;
  };
  const ids = { admin: signup.userId, manager: await mk("manager"), member: await mk("member"), member2: await mk("member", "member2"), viewer: await mk("viewer") };
  const { projectId } = await projects.createProject(adminCtx, { key: "WEB", name: "Web" });
  const { projectId: secretId } = await projects.createProject(adminCtx, {
    key: "SEC",
    name: "Gizli",
    restricted: true,
    memberIds: [ids.member2],
  });
  const cols = await projects.projectColumns(projectId);
  const { taskId, key } = await tasks.createTask(adminCtx, {
    projectId,
    title: "İstanbul ofisi taşınması",
    labels: ["Ofis"],
    assigneeIds: [ids.member2],
  });
  const ctx = {
    admin: adminCtx,
    manager: await ctxOf(ids.manager),
    member: await ctxOf(ids.member),
    member2: await ctxOf(ids.member2),
    viewer: await ctxOf(ids.viewer),
  };
  return { workspaceId: adminCtx.workspaceId, ids, ctx, projectId, secretId, cols, taskId, key, roleId, tag };
}

export async function expectCode(p: Promise<unknown>, ...codes: ErrorCode[]) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect(codes).toContain((e as AppError).code);
    return;
  }
  throw new Error(`expected ${codes.join("|")}, but the call succeeded`);
}

export async function versionOf(ctx: Ctx, key: string) {
  return (await tasks.getTaskDetail(ctx, key)).task.version;
}
