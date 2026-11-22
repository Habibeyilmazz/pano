import { notFound } from "next/navigation";
import { UsersAdmin } from "@/components/admin";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/session";
import { can } from "@/server/ctx";
import { listRoles, listUsers } from "@/server/admin";

export async function generateMetadata() {
  return { title: (await getI18n()).m.admin.usersTitle };
}

export default async function UsersPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "users.manage")) notFound();
  const [{ m }, users, roles] = await Promise.all([getI18n(), listUsers(ctx), listRoles(ctx)]);
  // Only roles within the admin's own permissions can be handed out (the server enforces the same rule).
  const assignable = roles.filter((r) => r.permissions.every((p) => ctx.perms.has(p as never))).map((r) => r.id);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={m.admin.usersTitle} lead={m.admin.usersLead} />
      <UsersAdmin users={users} roles={roles} meId={ctx.userId} assignable={assignable} />
    </div>
  );
}
