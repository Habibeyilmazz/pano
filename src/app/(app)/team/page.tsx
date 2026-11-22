import Link from "next/link";
import { AlertTriangle, UsersRound } from "lucide-react";
import { Avatar, EmptyState, PageHeader } from "@/components/ui";
import { Lane } from "@/components/work";
import { getI18n } from "@/lib/i18n/server";
import { orNotFound, requireCtx } from "@/lib/session";
import { visibleProjects } from "@/server/ctx";
import { team } from "@/server/views";

export async function generateMetadata() {
  return { title: (await getI18n()).m.team.title };
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const ctx = await requireCtx();
  const { project } = await searchParams;
  const [i, projects] = await Promise.all([getI18n(), visibleProjects(ctx)]);
  const selected = projects.find((p) => p.key === project);
  const rows = await orNotFound(team(ctx, project ? (selected?.id ?? "00000000-0000-0000-0000-000000000000") : undefined));
  const { m } = i;
  const q = selected ? `?project=${selected.key}` : "";
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={m.team.title} lead={m.team.lead} />
      <nav aria-label={m.team.project} className="mb-5 flex flex-wrap gap-2">
        <Link href="/team" className="chip" aria-pressed={!selected} aria-current={!selected ? "page" : undefined}>
          {m.team.allProjects}
        </Link>
        {projects.map((p) => (
          <Link key={p.id} href={`/team?project=${p.key}`} className="chip" aria-pressed={selected?.id === p.id} aria-current={selected?.id === p.id ? "page" : undefined}>
            <span className="text-[11px] font-semibold text-ink-3">{p.key}</span> {p.name}
          </Link>
        ))}
      </nav>
      {!rows.length ? (
        <EmptyState title={m.team.emptyTitle} lead={m.team.emptyLead} icon={<UsersRound size={28} />} />
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[minmax(12rem,16rem)_repeat(3,minmax(0,1fr))] gap-4 border-b border-line bg-surface-2 px-4 py-2 text-xs font-semibold text-ink-2 lg:grid" aria-hidden>
            <span>{i.plural(m.team.people, rows.length)}</span>
            <span>{m.team.now}</span>
            <span>{m.team.next}</span>
            <span>{m.team.doneWeek}</span>
          </div>
          <ul className="divide-y divide-line">
            {rows.map((p) => {
              const more = `/team/${p.id}${q}`;
              return (
                <li key={p.id} className="grid gap-2.5 px-4 py-3.5 lg:grid-cols-[minmax(12rem,16rem)_repeat(3,minmax(0,1fr))] lg:gap-4">
                  <div className="flex items-start gap-3">
                    <Avatar id={p.id} name={p.name} size={36} title="" />
                    <div className="min-w-0">
                      <Link href={more} className="font-semibold text-ink hover:underline">
                        {p.name}
                        {p.id === ctx.userId && <span className="font-normal text-ink-3"> ({m.common.you})</span>}
                      </Link>
                      <p className="text-xs text-ink-3">{i.roleName(p)}</p>
                      <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                        <span className="tag bg-surface-2 text-ink-2">{i.plural(m.team.open, p.doing.length + p.todo.length)}</span>
                        {p.openPoints > 0 && <span className="tag bg-surface-2 text-ink-2">{i.fmt(m.team.points, { n: i.num(p.openPoints) })}</span>}
                        {p.overdue > 0 && (
                          <span className="tag gap-1 bg-danger-soft text-danger">
                            <AlertTriangle size={12} aria-hidden />
                            {i.plural(m.team.overdue, p.overdue)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <LaneCell title={m.team.now} empty={!p.doing.length}>
                    <Lane items={p.doing} max={3} tone="now" empty={m.team.idle} i={i} more={more} />
                  </LaneCell>
                  <LaneCell title={m.team.next} empty={!p.todo.length}>
                    <Lane items={p.todo} max={2} tone="next" empty={m.team.nothingNext} i={i} more={more} />
                  </LaneCell>
                  <LaneCell title={`${m.team.doneWeek}${p.done.length ? ` (${p.done.length})` : ""}`} empty={!p.done.length}>
                    <Lane items={p.done} max={4} tone="done" empty={m.team.nothingDone} i={i} more={more} />
                  </LaneCell>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** On phones an empty lane is one line ("Next: nothing queued"); on wide screens the column header names it. */
function LaneCell({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className={empty ? "max-lg:flex max-lg:items-baseline max-lg:gap-2" : undefined}>
      <h3 className="mb-1 shrink-0 text-xs font-semibold text-ink-2 lg:sr-only">{title}</h3>
      {children}
    </div>
  );
}
