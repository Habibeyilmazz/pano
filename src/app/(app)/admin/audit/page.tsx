import { notFound } from "next/navigation";
import { ScrollText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/session";
import { can } from "@/server/ctx";
import { listAudit } from "@/server/admin";
import type { I18n } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getI18n()).m.admin.auditTitle };
}

function describe(i: I18n, action: string, d: Record<string, unknown>) {
  const { m, fmt } = i;
  const tpl = m.admin.actions[action as keyof typeof m.admin.actions];
  if (!tpl) return action;
  const role = (v: unknown) => {
    const s = String(v ?? "");
    return (m.roles.builtin as Record<string, string>)[s] ?? s;
  };
  let text = fmt(tpl, { name: String(d.name ?? ""), role: role(d.role), from: role(d.from), to: role(d.to), key: String(d.key ?? ""), title: String(d.title ?? "") });
  if (action === "role.permissions_changed" && Array.isArray(d.from) && Array.isArray(d.to)) {
    const label = (p: string) => m.roles.perms[p as keyof typeof m.roles.perms] ?? p;
    const added = (d.to as string[]).filter((p) => !(d.from as string[]).includes(p)).map(label);
    const removed = (d.from as string[]).filter((p) => !(d.to as string[]).includes(p)).map(label);
    if (added.length) text += ` (${fmt(m.admin.added, { list: added.join(", ") })})`;
    if (removed.length) text += ` (${fmt(m.admin.removedPerms, { list: removed.join(", ") })})`;
  }
  return text;
}

export default async function AuditPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "users.manage")) notFound();
  const [i, rows] = await Promise.all([getI18n(), listAudit(ctx)]);
  const { m } = i;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={m.admin.auditTitle} lead={m.admin.auditLead} />
      {!rows.length ? (
        <EmptyState title={m.admin.auditEmpty} icon={<ScrollText size={28} />} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-xs text-ink-2">
              <tr>
                <th className="px-4 py-2 font-medium">{m.admin.when}</th>
                <th className="px-4 py-2 font-medium">{m.admin.who}</th>
                <th className="px-4 py-2 font-medium">{m.admin.what}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">
                    <time dateTime={new Date(r.createdAt).toISOString()}>{i.dateTime(r.createdAt)}</time>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{r.actor}</td>
                  <td className="px-4 py-2.5">{describe(i, r.action, r.data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
