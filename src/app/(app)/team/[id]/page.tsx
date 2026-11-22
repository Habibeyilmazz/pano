import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { activityText } from "@/components/activity";
import { Avatar } from "@/components/ui";
import { WorkSection } from "@/components/work";
import { getI18n } from "@/lib/i18n/server";
import { orNotFound, requireCtx } from "@/lib/session";
import { person } from "@/server/views";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const [i, p] = await Promise.all([getI18n(), orNotFound(person(ctx, id))]);
  const { m } = i;
  return (
    <div className="mx-auto max-w-4xl">
      <title>{p.user.name}</title>
      <Link href="/team" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> {m.team.title}
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar id={p.user.id} name={p.user.name} size={56} title="" />
        <div className="min-w-0 flex-1">
          <h1 className="page-title">{p.user.name}</h1>
          <p className="text-sm text-ink-2">
            {i.roleName(p.user)} · {p.user.email}
          </p>
          {!p.user.active && <p className="mt-1 text-sm font-medium text-danger">{m.team.inactive}</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="tag bg-surface-2 px-2.5 py-1 text-ink-2">{i.plural(m.team.open, p.doing.length + p.todo.length)}</span>
          {p.openPoints > 0 && <span className="tag bg-surface-2 px-2.5 py-1 text-ink-2">{i.fmt(m.team.points, { n: i.num(p.openPoints) })}</span>}
          {p.overdue > 0 && (
            <span className="tag gap-1 bg-danger-soft px-2.5 py-1 text-danger">
              <AlertTriangle size={14} aria-hidden />
              {i.plural(m.team.overdue, p.overdue)}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-4">
        <WorkSection kind="doing" title={m.team.now} items={p.doing} empty={m.team.idle} i={i} />
        <WorkSection kind="todo" title={m.team.next} items={p.todo} empty={m.team.nothingNext} i={i} />
        <WorkSection kind="done" title={m.team.doneWeek} items={p.done} empty={m.team.nothingDone} i={i} />
      </div>
      <section className="mt-8" aria-labelledby="recent">
        <h2 id="recent" className="mb-3 section-title">
          {m.team.recentActivity}
        </h2>
        {p.activity.length ? (
          <ol className="card divide-y divide-line">
            {p.activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2.5 text-sm">
                <span className="text-ink">{activityText({ ...a, actorId: p.user.id }, i, p.people, p.columns)}</span>
                {a.taskKey && (
                  <Link href={`/projects/${a.taskKey.split("-")[0]}?task=${a.taskKey}`} className="min-w-0 truncate font-medium text-brand hover:underline">
                    {a.taskKey} {a.taskTitle}
                  </Link>
                )}
                <time className="ml-auto text-xs text-ink-3" dateTime={new Date(a.createdAt).toISOString()} title={i.dateTime(a.createdAt)}>
                  {i.ago(a.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-3">{m.team.noActivity}</p>
        )}
      </section>
    </div>
  );
}
