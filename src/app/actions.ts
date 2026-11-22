"use server";
// Every mutation in the app goes through this file. Each action is a thin shell: it resolves the
// caller from the session cookie and hands the raw input to a service, which validates it with zod
// and enforces permissions and company scoping. Next.js rejects cross-origin action calls (CSRF).

import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, type ErrorCode } from "@/lib/errors";
import { isLocale } from "@/lib/i18n";
import { clientIp, getCtx, SESSION_COOKIE, setLocaleCookie, setSessionCookie } from "@/lib/session";
import * as account from "@/server/account";
import * as admin from "@/server/admin";
import { sendAccessLink } from "@/server/mail";
import type { Ctx } from "@/server/ctx";
import * as notifications from "@/server/notifications";
import * as projects from "@/server/projects";
import * as sprints from "@/server/sprints";
import * as tasks from "@/server/tasks";

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: ErrorCode };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) {
      if (e.code === "conflict") refresh();
      return { ok: false, error: e.code };
    }
    throw e;
  }
}

/** Signed-in mutation: fresh ctx from the DB, so deactivation and role changes apply immediately. */
async function run<T>(fn: (ctx: Ctx) => Promise<T>): Promise<Result<T>> {
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "unauthenticated" };
  if (ctx.mustChangePassword) return { ok: false, error: "forbidden" };
  const r = await guard(() => fn(ctx));
  if (r.ok) refresh();
  return r;
}

async function origin() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

// ---- account ----

export async function signupAction(input: unknown) {
  const r = await guard(async () => account.signupCompany(input, await clientIp()));
  if (r.ok) await setSessionCookie(r.data.token, r.data.expiresAt);
  return r.ok ? { ok: true as const, data: null } : r;
}

export async function loginAction(input: unknown) {
  const r = await guard(async () => account.login(input, await clientIp()));
  if (!r.ok) return r;
  await setSessionCookie(r.data.token, r.data.expiresAt);
  return { ok: true as const, data: null };
}

export async function acceptInviteAction(input: unknown) {
  const r = await guard(() => account.acceptInvite(input));
  if (r.ok) await setSessionCookie(r.data.token, r.data.expiresAt);
  return r.ok ? { ok: true as const, data: null } : r;
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await account.deleteSession(token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

/** Works signed out (login page switch) and signed in (saved on the profile). */
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  await setLocaleCookie(locale);
  const ctx = await getCtx();
  if (ctx) await account.updateProfile(ctx, { locale });
  refresh();
}

export async function changePasswordAction(input: unknown) {
  const ctx = await getCtx();
  if (!ctx) return { ok: false as const, error: "unauthenticated" as const };
  const r = await guard(() => account.changePassword(ctx, input));
  if (r.ok) await setSessionCookie(r.data.token, r.data.expiresAt);
  return r.ok ? { ok: true as const, data: null } : r;
}

export async function updateProfileAction(input: unknown) {
  const r = await run((ctx) => account.updateProfile(ctx, input));
  const locale = (input as { locale?: string })?.locale;
  if (r.ok && isLocale(locale)) await setLocaleCookie(locale);
  return r;
}

// ---- admin ----

export async function createUserAction(input: unknown) {
  const base = await origin();
  return run(async (ctx) => {
    const { userId, inviteToken } = await admin.createUser(ctx, input);
    const url = inviteToken ? `${base}/invite/${inviteToken}` : null;
    const u = input as { email: string; name: string; locale: string };
    const emailed = url ? await sendAccessLink({ to: u.email, name: u.name, url, kind: "invite", locale: u.locale }) : false;
    return { userId, inviteUrl: url, emailed };
  });
}
export async function updateUserAction(input: unknown) {
  return run((ctx) => admin.updateUser(ctx, input));
}
export async function resetPasswordAction(input: unknown) {
  const base = await origin();
  return run(async (ctx) => {
    const { inviteToken } = await admin.resetPassword(ctx, input);
    return { inviteUrl: inviteToken ? `${base}/invite/${inviteToken}` : null };
  });
}
export async function createRoleAction(input: unknown) {
  return run((ctx) => admin.createRole(ctx, input));
}
export async function updateRoleAction(input: unknown) {
  return run((ctx) => admin.updateRole(ctx, input));
}
export async function deleteRoleAction(input: unknown) {
  return run((ctx) => admin.deleteRole(ctx, input));
}

// ---- projects ----

export async function createProjectAction(input: unknown) {
  return run((ctx) => projects.createProject(ctx, input));
}
export async function updateProjectAction(input: unknown) {
  return run((ctx) => projects.updateProject(ctx, input));
}
export async function addColumnAction(input: unknown) {
  return run((ctx) => projects.addColumn(ctx, input));
}
export async function updateColumnAction(input: unknown) {
  return run((ctx) => projects.updateColumn(ctx, input));
}
export async function moveColumnAction(input: unknown) {
  return run((ctx) => projects.moveColumn(ctx, input));
}
export async function deleteColumnAction(input: unknown) {
  return run((ctx) => projects.deleteColumn(ctx, input));
}

// ---- sprints ----

export async function createSprintAction(input: unknown) {
  return run((ctx) => sprints.createSprint(ctx, input));
}
export async function updateSprintAction(input: unknown) {
  return run((ctx) => sprints.updateSprint(ctx, input));
}
export async function startSprintAction(input: unknown) {
  return run((ctx) => sprints.startSprint(ctx, input));
}
export async function completeSprintAction(input: unknown) {
  return run((ctx) => sprints.completeSprint(ctx, input));
}
export async function deleteSprintAction(input: unknown) {
  return run((ctx) => sprints.deleteSprint(ctx, input));
}

// ---- tasks ----

export async function createTaskAction(input: unknown) {
  return run((ctx) => tasks.createTask(ctx, input));
}
export async function updateTaskAction(input: unknown) {
  return run((ctx) => tasks.updateTask(ctx, input));
}
export async function moveTaskAction(input: unknown) {
  return run((ctx) => tasks.moveTask(ctx, input));
}
export async function deleteTaskAction(input: unknown) {
  return run((ctx) => tasks.deleteTask(ctx, input));
}
export async function copyTaskAction(input: unknown) {
  return run((ctx) => tasks.copyTask(ctx, input));
}
export async function assignTaskAction(input: unknown) {
  return run((ctx) => tasks.assignTask(ctx, input));
}
export async function unassignTaskAction(input: unknown) {
  return run((ctx) => tasks.unassignTask(ctx, input));
}
export async function addChecklistItemAction(input: unknown) {
  return run((ctx) => tasks.addChecklistItem(ctx, input));
}
export async function toggleChecklistItemAction(input: unknown) {
  return run((ctx) => tasks.toggleChecklistItem(ctx, input));
}
export async function deleteChecklistItemAction(input: unknown) {
  return run((ctx) => tasks.deleteChecklistItem(ctx, input));
}
export async function addCommentAction(input: unknown) {
  return run((ctx) => tasks.addComment(ctx, input));
}
export async function markNotificationsReadAction(input: unknown) {
  return run((ctx) => notifications.markNotificationsRead(ctx, input));
}
