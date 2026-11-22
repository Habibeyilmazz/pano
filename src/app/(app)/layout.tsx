import { redirect } from "next/navigation";
import { Shell, type NavItem } from "@/components/shell";
import { getI18n } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/session";
import { can, visibleProjects } from "@/server/ctx";
import { unreadCount } from "@/server/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (ctx.mustChangePassword) redirect("/change-password");
  const [i, projects, unread] = await Promise.all([getI18n(), visibleProjects(ctx), unreadCount(ctx)]);
  const { m } = i;
  const main: NavItem[] = [
    { href: "/my-work", label: m.nav.myWork, icon: "myWork" },
    { href: "/projects", label: m.nav.projects, icon: "projects" },
    { href: "/team", label: m.nav.team, icon: "team" },
    ...(can(ctx, "reports.view") ? [{ href: "/dashboard", label: m.nav.dashboard, icon: "dashboard" } as const] : []),
    { href: "/settings", label: m.nav.settings, icon: "settings" },
  ];
  const admin: NavItem[] = [
    ...(can(ctx, "users.manage") ? [{ href: "/admin/users", label: m.nav.users, icon: "users" } as const] : []),
    ...(can(ctx, "roles.manage") ? [{ href: "/admin/roles", label: m.nav.roles, icon: "roles" } as const] : []),
    ...(can(ctx, "users.manage") ? [{ href: "/admin/audit", label: m.nav.audit, icon: "audit" } as const] : []),
  ];
  return (
    <Shell
      main={main}
      admin={admin}
      projects={projects.map((p) => ({ key: p.key, name: p.name }))}
      user={{ id: ctx.userId, name: ctx.name, workspace: ctx.workspaceName, role: i.roleName({ name: ctx.roleName, builtin: ctx.roleBuiltin }) }}
      unread={unread}
      canCreate={can(ctx, "tasks.create")}
    >
      {children}
    </Shell>
  );
}
