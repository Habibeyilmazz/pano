import Link from "next/link";
import { FolderKanban, Lock } from "lucide-react";
import { NewProjectButton } from "@/components/forms";
import { EmptyState, PageHeader } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/session";
import { activeUsers, can } from "@/server/ctx";
import { listProjects } from "@/server/projects";

export async function generateMetadata() {
  return { title: (await getI18n()).m.projects.title };
}

export default async function ProjectsPage() {
  const ctx = await requireCtx();
  const [i, projects] = await Promise.all([getI18n(), listProjects(ctx)]);
  const { m } = i;
  const canManage = can(ctx, "projects.manage");
  const people = canManage ? await activeUsers(ctx) : [];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={m.projects.title} lead={m.projects.lead} actions={canManage && <NewProjectButton people={people} />} />
      {!projects.length ? (
        <EmptyState title={m.projects.emptyTitle} lead={canManage ? m.projects.emptyLead : m.projects.emptyLeadNoPerm} icon={<FolderKanban size={28} />} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => {
            const pct = p.total ? Math.round(((p.total - p.open) / p.total) * 100) : 0;
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.key}`} className="card block h-full p-4 hover:border-brand">
                  <span className="flex items-center gap-2">
                    <span className="rounded bg-brand-soft px-1.5 py-0.5 text-xs font-bold text-ink">{p.key}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                    {p.restricted && (
                      <span className="tag gap-1 bg-surface-2 text-ink-2">
                        <Lock size={12} aria-hidden /> {m.projects.restrictedBadge}
                      </span>
                    )}
                  </span>
                  {p.description && <span className="mt-2 line-clamp-2 block text-sm text-ink-2">{p.description}</span>}
                  <span className="mt-4 flex items-center gap-3 text-xs text-ink-2">
                    <span className="h-1.5 flex-1 rounded-full bg-surface-2" aria-hidden>
                      <span className="block h-1.5 rounded-full bg-ok/70" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="tabular-nums">{i.plural(m.projects.openTasks, p.open)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
