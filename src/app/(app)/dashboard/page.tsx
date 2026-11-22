import Link from "next/link";
import { notFound } from "next/navigation";
import { SprintReport } from "@/components/burndown";
import { Avatar, PageHeader, PriorityIcon, taskHref } from "@/components/ui";
import { today } from "@/lib/dates";
import { getI18n } from "@/lib/i18n/server";
import { orNotFound, requireCtx } from "@/lib/session";
import { can, visibleProjects } from "@/server/ctx";
import { dashboard } from "@/server/views";

export async function generateMetadata() {
  return { title: (await getI18n()).m.dashboard.title };
}

const STATUS_COLOR = { todo: "bg-ink-3/45", doing: "bg-brand", done: "bg-ok/70" } as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "reports.view")) notFound();
  const { project } = await searchParams;
  const [i, projects] = await Promise.all([getI18n(), visibleProjects(ctx)]);
  const selected = projects.find((p) => p.key === project);
  const d = await orNotFound(dashboard(ctx, project ? (selected?.id ?? "00000000-0000-0000-0000-000000000000") : undefined));
  const { m } = i;
  const total = d.byStatus.todo + d.byStatus.doing + d.byStatus.done;
  const maxWeek = Math.max(1, ...d.perWeek.map((w) => w.done));
  const maxLoad = Math.max(1, ...d.workload.map((w) => w.doing.length + w.todo.length));
  const t = today();
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={m.dashboard.title} lead={m.dashboard.lead} />
      <nav aria-label={m.team.project} className="mb-5 flex flex-wrap gap-2">
        <Link href="/dashboard" className="chip" aria-pressed={!selected}>
          {m.team.allProjects}
        </Link>
        {projects.map((p) => (
          <Link key={p.id} href={`/dashboard?project=${p.key}`} className="chip" aria-pressed={selected?.id === p.id}>
            <span className="text-[11px] font-semibold text-ink-3">{p.key}</span> {p.name}
          </Link>
        ))}
      </nav>
      {d.sprints.length > 0 && (
        <section aria-labelledby="sprints" className="mb-4">
          <h2 id="sprints" className="section-title mb-2">
            {m.dashboard.sprints}
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {d.sprints.map((r) => (
              <SprintReport key={r.sprint.id} r={r} i={i} />
            ))}
          </div>
        </section>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="by-status">
          <h2 id="by-status" className="section-title">
            {m.dashboard.byStatus}
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {m.dashboard.total}: <span className="font-semibold text-ink tabular-nums">{i.num(total)}</span>
          </p>
          <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            {(["todo", "doing", "done"] as const).map((k) => (
              <div key={k} className={STATUS_COLOR[k]} style={{ width: `${total ? (d.byStatus[k] / total) * 100 : 0}%` }} />
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            {(["todo", "doing", "done"] as const).map((k) => (
              <div key={k}>
                <dt className="flex items-center gap-1.5 text-xs text-ink-2">
                  <span className={`size-2.5 rounded-full ${STATUS_COLOR[k]}`} aria-hidden />
                  {m.columns.categories[k]}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums">{i.num(d.byStatus[k])}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card p-5" aria-labelledby="per-week">
          <h2 id="per-week" className="section-title">
            {m.dashboard.perWeek}
          </h2>
          <ol className="mt-4 flex h-40 items-end gap-2">
            {d.perWeek.map((w) => (
              <li key={w.week} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-xs font-semibold text-ink-2 tabular-nums">{w.done}</span>
                <span
                  className="w-full max-w-10 rounded-t bg-brand"
                  style={{ height: `${(w.done / maxWeek) * 100}%`, minHeight: w.done ? 4 : 1, opacity: w.done ? 1 : 0.25 }}
                  aria-hidden
                />
                <span className="text-center text-[11px] leading-tight text-ink-3 sm:whitespace-nowrap">
                  <span className="sr-only">{i.fmt(m.dashboard.weekOf, { date: i.day(w.week) })}: </span>
                  <span aria-hidden>{i.day(w.week)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="card p-5" aria-labelledby="overdue">
          <h2 id="overdue" className="section-title">
            {m.dashboard.overdue} <span className="text-ink-3 tabular-nums">({i.num(d.overdueTotal)})</span>
          </h2>
          {d.overdue.length ? (
            <ul className="mt-3 divide-y divide-line">
              {d.overdue.map((o) => {
                const late = Math.round((+new Date(t) - +new Date(o.dueDate!)) / 864e5);
                return (
                  <li key={o.taskId}>
                    <Link href={taskHref(o.key)} className="flex items-center gap-2.5 py-2 hover:bg-surface-2">
                      <PriorityIcon priority={o.priority} label={m.priority[o.priority as "medium"]} />
                      <span className="text-xs font-semibold text-ink-3">{o.key}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{o.title}</span>
                      <span className="hidden max-w-[10rem] truncate text-xs text-ink-3 sm:block">{o.assignees.join(", ") || m.board.unassigned}</span>
                      <span className="tag bg-danger-soft text-danger">{i.plural(m.dashboard.daysLate, late)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-3">{m.dashboard.noOverdue}</p>
          )}
          {d.overdueTotal > d.overdue.length && (
            <p className="mt-2 text-xs text-ink-3">{i.fmt(m.common.shownFirst, { n: i.num(d.overdue.length) })}</p>
          )}
        </section>

        <section className="card p-5" aria-labelledby="workload">
          <h2 id="workload" className="section-title">
            {m.dashboard.workload}
          </h2>
          {d.workload.length ? (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="pb-2 font-medium">{m.admin.name}</th>
                  <th className="pb-2 pl-2 text-right font-medium">{m.dashboard.openTasks}</th>
                  <th className="pb-2 pl-2 text-right font-medium">{m.dashboard.openPoints}</th>
                  <th className="hidden w-1/3 pb-2 sm:table-cell" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {d.workload.map((w) => {
                  const open = w.doing.length + w.todo.length;
                  return (
                    <tr key={w.id} className="border-t border-line">
                      <td className="py-2">
                        <Link href={`/team/${w.id}`} className="flex items-center gap-2 hover:underline">
                          <Avatar id={w.id} name={w.name} size={24} title="" />
                          <span className="truncate">{w.name}</span>
                        </Link>
                      </td>
                      <td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums">
                        {open}
                        {w.overdue > 0 && <span className="ml-1.5 tag bg-danger-soft text-danger">{i.plural(m.team.overdue, w.overdue)}</span>}
                      </td>
                      <td className="py-2 pl-2 text-right tabular-nums">{i.num(w.openPoints)}</td>
                      <td className="hidden py-2 pl-3 sm:table-cell" aria-hidden>
                        <div className="h-2 rounded-full bg-surface-2">
                          <div className="h-2 rounded-full bg-brand" style={{ width: `${(open / maxLoad) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-ink-3">{m.dashboard.noWorkload}</p>
          )}
        </section>
      </div>
    </div>
  );
}
