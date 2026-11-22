import { notFound } from "next/navigation";
import { RolesAdmin } from "@/components/admin";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/session";
import { can } from "@/server/ctx";
import { listRoles } from "@/server/admin";

export async function generateMetadata() {
  return { title: (await getI18n()).m.roles.title };
}

export default async function RolesPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "roles.manage")) notFound();
  const [{ m }, roles] = await Promise.all([getI18n(), listRoles(ctx)]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={m.roles.title} lead={m.roles.lead} />
      <RolesAdmin roles={roles} mine={[...ctx.perms]} />
    </div>
  );
}
