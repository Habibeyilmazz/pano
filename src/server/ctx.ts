import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema as s, type Db } from "@/db";
import { fail } from "@/lib/errors";
import { isPerm, type Perm } from "@/lib/perms";

export type Locale = "tr" | "en";

const collator = new Intl.Collator("tr-TR");
/** Turkish alphabetical order (the database collation would put "İ" after "Z"). */
export const byName = <T extends { name: string }>(a: T, b: T) => collator.compare(a.name, b.name);

/** Everything a service needs to know about the caller. Built fresh per request from the DB. */
export type Ctx = {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  name: string;
  email: string;
  locale: Locale;
  theme: string;
  roleName: string;
  roleBuiltin: string | null;
  perms: Set<Perm>;
  mustChangePassword: boolean;
};

export async function loadCtx(userId: string): Promise<Ctx | null> {
  const db = await getDb();
  const [row] = await db
    .select({ u: s.users, r: s.roles, w: s.workspaces })
    .from(s.users)
    .innerJoin(s.roles, eq(s.roles.id, s.users.roleId))
    .innerJoin(s.workspaces, eq(s.workspaces.id, s.users.workspaceId))
    .where(and(eq(s.users.id, userId), eq(s.users.active, true)));
  if (!row) return null;
  return {
    userId: row.u.id,
    workspaceId: row.u.workspaceId,
    workspaceName: row.w.name,
    name: row.u.name,
    email: row.u.email,
    locale: row.u.locale === "en" ? "en" : "tr",
    theme: row.u.theme,
    roleName: row.r.name,
    roleBuiltin: row.r.builtin,
    perms: new Set(row.r.permissions.filter(isPerm)),
    mustChangePassword: row.u.mustChangePassword,
  };
}

export const can = (ctx: Ctx, p: Perm) => ctx.perms.has(p);
export const need = (ctx: Ctx, p: Perm) => {
  if (!ctx.perms.has(p)) fail("forbidden");
};

/** Projects the caller can see. Project managers and admins see restricted projects too. */
export async function visibleProjects(ctx: Ctx, db?: Db) {
  db ??= await getDb();
  const seeAll = can(ctx, "projects.manage") || can(ctx, "users.manage");
  return db
    .select()
    .from(s.projects)
    .where(
      and(
        eq(s.projects.workspaceId, ctx.workspaceId),
        seeAll
          ? undefined
          : or(
              eq(s.projects.restricted, false),
              sql`exists (select 1 from ${s.projectMembers} pm where pm.project_id = ${s.projects}.id and pm.user_id = ${ctx.userId})`,
            ),
      ),
    )
    .then((rows) => rows.sort(byName));
}

export async function visibleProjectIds(ctx: Ctx, db?: Db) {
  return (await visibleProjects(ctx, db)).map((p) => p.id);
}

/** A project by id or key that the caller may see, or not_found (never forbidden: do not leak existence). */
export async function getProject(ctx: Ctx, ref: { id?: string; key?: string }) {
  const list = await visibleProjects(ctx);
  const p = list.find((x) => (ref.id ? x.id === ref.id : x.key === ref.key?.toUpperCase()));
  return p ?? fail("not_found");
}

/** Active users of the caller's workspace who can see the given project. */
export async function projectPeople(ctx: Ctx, projectId: string) {
  const db = await getDb();
  const [project] = await db
    .select()
    .from(s.projects)
    .where(and(eq(s.projects.id, projectId), eq(s.projects.workspaceId, ctx.workspaceId)));
  if (!project) return [];
  const people = await db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email, perms: s.roles.permissions })
    .from(s.users)
    .innerJoin(s.roles, eq(s.roles.id, s.users.roleId))
    .where(and(eq(s.users.workspaceId, ctx.workspaceId), eq(s.users.active, true)))
    .then((rows) => rows.sort(byName));
  if (!project.restricted) return people.map(({ perms: _p, ...u }) => u);
  const members = await db
    .select({ userId: s.projectMembers.userId })
    .from(s.projectMembers)
    .where(eq(s.projectMembers.projectId, projectId));
  const ids = new Set(members.map((m) => m.userId));
  return people
    .filter((u) => ids.has(u.id) || u.perms.includes("projects.manage") || u.perms.includes("users.manage"))
    .map(({ perms: _p, ...u }) => u);
}

export async function activeUsers(ctx: Ctx) {
  const db = await getDb();
  const rows = await db
    .select({ id: s.users.id, name: s.users.name })
    .from(s.users)
    .where(and(eq(s.users.workspaceId, ctx.workspaceId), eq(s.users.active, true)));
  return rows.sort(byName);
}

export async function usersByIds(ctx: Ctx, ids: string[]) {
  if (!ids.length) return [];
  const db = await getDb();
  return db
    .select({ id: s.users.id, name: s.users.name })
    .from(s.users)
    .where(and(eq(s.users.workspaceId, ctx.workspaceId), inArray(s.users.id, ids)));
}
