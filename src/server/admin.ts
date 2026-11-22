import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction, schema as s, type Tx } from "@/db";
import { fail } from "@/lib/errors";
import { PERMISSIONS, type Perm } from "@/lib/perms";
import {
  deleteUserSessions,
  emailSchema,
  hashPassword,
  localeSchema,
  nameSchema,
  newToken,
  parse,
  passwordSchema,
  sha256,
} from "./account";
import { byName, need, type Ctx } from "./ctx";

const INVITE_DAYS = 7;

export async function audit(tx: Tx, ctx: Ctx, action: string, data: Record<string, unknown>) {
  await tx.insert(s.auditLogs).values({ workspaceId: ctx.workspaceId, actorId: ctx.userId, action, data });
}

async function roleInWorkspace(tx: Tx, ctx: Ctx, roleId: string) {
  const [r] = await tx
    .select()
    .from(s.roles)
    .where(and(eq(s.roles.id, roleId), eq(s.roles.workspaceId, ctx.workspaceId)));
  return r ?? fail("not_found");
}

/** Nobody may hand out, or act on someone holding, permissions they do not have themselves. */
function assertWithinMine(ctx: Ctx, perms: string[]) {
  if (perms.some((p) => !ctx.perms.has(p as Perm))) fail("forbidden");
}

async function userInWorkspace(tx: Tx, ctx: Ctx, userId: string) {
  const [row] = await tx
    .select({ u: s.users, perms: s.roles.permissions, builtin: s.roles.builtin, roleName: s.roles.name })
    .from(s.users)
    .innerJoin(s.roles, eq(s.roles.id, s.users.roleId))
    .where(and(eq(s.users.id, userId), eq(s.users.workspaceId, ctx.workspaceId)));
  return row ?? fail("not_found");
}

async function activeAdminCount(tx: Tx, ctx: Ctx) {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(s.users)
    .innerJoin(s.roles, eq(s.roles.id, s.users.roleId))
    .where(and(eq(s.users.workspaceId, ctx.workspaceId), eq(s.users.active, true), eq(s.roles.builtin, "admin")));
  return n;
}

export async function listUsers(ctx: Ctx) {
  need(ctx, "users.manage");
  const db = await getDb();
  return db
    .select({
      id: s.users.id,
      name: s.users.name,
      email: s.users.email,
      locale: s.users.locale,
      active: s.users.active,
      roleId: s.users.roleId,
      pending: sql<boolean>`${s.users.passwordHash} is null`,
      createdAt: s.users.createdAt,
    })
    .from(s.users)
    .where(eq(s.users.workspaceId, ctx.workspaceId))
    .then((rows) => rows.sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b)));
}

const credentialSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("invite") }),
  z.object({ mode: z.literal("password"), password: passwordSchema }),
]);

const createUserSchema = z.intersection(
  z.object({ name: nameSchema, email: emailSchema, roleId: z.string().uuid(), locale: localeSchema }),
  credentialSchema,
);

/** Sets either a fresh invite token (returned once) or a temporary password the user must change. */
async function setCredential(tx: Tx, userId: string, cred: z.infer<typeof credentialSchema>) {
  if (cred.mode === "invite") {
    const token = newToken();
    await tx
      .update(s.users)
      .set({
        inviteTokenHash: sha256(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
      })
      .where(eq(s.users.id, userId));
    return token;
  }
  await tx
    .update(s.users)
    .set({
      passwordHash: await hashPassword(cred.password),
      mustChangePassword: true,
      inviteTokenHash: null,
      failedLogins: 0,
      lockedUntil: null,
    })
    .where(eq(s.users.id, userId));
  return null;
}

export async function createUser(ctx: Ctx, input: unknown) {
  need(ctx, "users.manage");
  const data = parse(createUserSchema, input);
  return transaction(async (tx) => {
    const role = await roleInWorkspace(tx, ctx, data.roleId);
    assertWithinMine(ctx, role.permissions);
    const [taken] = await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, data.email));
    if (taken) fail("email_taken");
    const [u] = await tx
      .insert(s.users)
      .values({ workspaceId: ctx.workspaceId, roleId: role.id, name: data.name, email: data.email, locale: data.locale })
      .returning();
    const token = await setCredential(tx, u.id, data);
    await audit(tx, ctx, "user.created", { userId: u.id, name: u.name, role: role.name });
    return { userId: u.id, inviteToken: token };
  });
}

const updateUserSchema = z.object({
  userId: z.string().uuid(),
  name: nameSchema.optional(),
  roleId: z.string().uuid().optional(),
  active: z.boolean().optional(),
});

export async function updateUser(ctx: Ctx, input: unknown) {
  need(ctx, "users.manage");
  const data = parse(updateUserSchema, input);
  await transaction(async (tx) => {
    const target = await userInWorkspace(tx, ctx, data.userId);
    assertWithinMine(ctx, target.perms);
    const patch: Partial<typeof s.users.$inferInsert> = {};
    if (data.name) patch.name = data.name;
    let newRole: typeof s.roles.$inferSelect | undefined;
    if (data.roleId && data.roleId !== target.u.roleId) {
      newRole = await roleInWorkspace(tx, ctx, data.roleId);
      assertWithinMine(ctx, newRole.permissions);
      patch.roleId = newRole.id;
    }
    if (data.active !== undefined && data.active !== target.u.active) {
      if (data.userId === ctx.userId) fail("forbidden");
      patch.active = data.active;
    }
    const losesAdmin =
      target.builtin === "admin" && target.u.active && ((newRole && newRole.builtin !== "admin") || patch.active === false);
    if (losesAdmin && (await activeAdminCount(tx, ctx)) <= 1) fail("last_admin");
    if (!Object.keys(patch).length) return;
    await tx.update(s.users).set(patch).where(eq(s.users.id, target.u.id));
    if (newRole || patch.active === false) await deleteUserSessions(target.u.id, tx);
    if (newRole)
      await audit(tx, ctx, "user.role_changed", { userId: target.u.id, name: target.u.name, from: target.roleName, to: newRole.name });
    if (patch.active !== undefined)
      await audit(tx, ctx, patch.active ? "user.activated" : "user.deactivated", { userId: target.u.id, name: target.u.name });
  });
}

export async function resetPassword(ctx: Ctx, input: unknown) {
  need(ctx, "users.manage");
  const data = parse(z.intersection(z.object({ userId: z.string().uuid() }), credentialSchema), input);
  return transaction(async (tx) => {
    const target = await userInWorkspace(tx, ctx, data.userId);
    assertWithinMine(ctx, target.perms);
    const token = await setCredential(tx, target.u.id, data);
    await deleteUserSessions(target.u.id, tx);
    await audit(tx, ctx, "user.password_reset", { userId: target.u.id, name: target.u.name });
    return { inviteToken: token };
  });
}

export async function listRoles(ctx: Ctx) {
  const db = await getDb();
  const rows = await db
    .select({ role: s.roles, users: sql<number>`(select count(*)::int from ${s.users} u where u.role_id = ${s.roles}.id and u.active)` })
    .from(s.roles)
    .where(eq(s.roles.workspaceId, ctx.workspaceId))
    .orderBy(sql`${s.roles.builtin} is null`, s.roles.createdAt);
  return rows.map((r) => ({ ...r.role, users: r.users }));
}

const permsSchema = z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length);
const roleSchema = z.object({ name: z.string().trim().min(2).max(50), permissions: permsSchema });

export async function createRole(ctx: Ctx, input: unknown) {
  need(ctx, "roles.manage");
  const data = parse(roleSchema, input);
  assertWithinMine(ctx, data.permissions);
  return transaction(async (tx) => {
    const [r] = await tx
      .insert(s.roles)
      .values({ workspaceId: ctx.workspaceId, name: data.name, permissions: [...new Set(data.permissions)] })
      .returning();
    await audit(tx, ctx, "role.created", { roleId: r.id, name: r.name, permissions: r.permissions });
    return { roleId: r.id };
  });
}

async function customRole(tx: Tx, ctx: Ctx, roleId: string) {
  const r = await roleInWorkspace(tx, ctx, roleId);
  if (r.builtin) fail("forbidden");
  return r;
}

export async function updateRole(ctx: Ctx, input: unknown) {
  need(ctx, "roles.manage");
  const data = parse(roleSchema.extend({ roleId: z.string().uuid() }), input);
  await transaction(async (tx) => {
    const r = await customRole(tx, ctx, data.roleId);
    assertWithinMine(ctx, [...r.permissions, ...data.permissions]);
    const permissions = [...new Set(data.permissions)];
    await tx.update(s.roles).set({ name: data.name, permissions }).where(eq(s.roles.id, r.id));
    // Holders' sessions end so the new permissions apply from their next sign-in.
    const holders = await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.roleId, r.id));
    if (holders.length && r.permissions.join() !== permissions.join())
      await tx.delete(s.sessions).where(and(inArray(s.sessions.userId, holders.map((h) => h.id)), ne(s.sessions.userId, ctx.userId)));
    await audit(tx, ctx, "role.permissions_changed", { roleId: r.id, name: data.name, from: r.permissions, to: permissions });
  });
}

export async function deleteRole(ctx: Ctx, input: unknown) {
  need(ctx, "roles.manage");
  const { roleId } = parse(z.object({ roleId: z.string().uuid() }), input);
  await transaction(async (tx) => {
    const r = await customRole(tx, ctx, roleId);
    const [used] = await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.roleId, r.id)).limit(1);
    if (used) fail("role_in_use");
    await tx.delete(s.roles).where(eq(s.roles.id, r.id));
    await audit(tx, ctx, "role.deleted", { name: r.name });
  });
}

export async function listAudit(ctx: Ctx) {
  need(ctx, "users.manage");
  const db = await getDb();
  return db
    .select({ id: s.auditLogs.id, action: s.auditLogs.action, data: s.auditLogs.data, createdAt: s.auditLogs.createdAt, actor: s.users.name })
    .from(s.auditLogs)
    .innerJoin(s.users, eq(s.users.id, s.auditLogs.actorId))
    .where(eq(s.auditLogs.workspaceId, ctx.workspaceId))
    .orderBy(desc(s.auditLogs.createdAt))
    .limit(200);
}
