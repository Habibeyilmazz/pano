import Link from "next/link";
import { Flag } from "lucide-react";
import { daysBetween, today } from "@/lib/dates";
import type { I18n } from "@/lib/i18n";
import type { dashboard } from "@/server/views";

type Report = Awaited<ReturnType<typeof dashboard>>["sprints"][number];

/** A running sprint on the Overview page: where it stands and its burndown, with a table for screen readers. */
export function SprintReport({ r, i }: { r: Report; i: I18n }) {
  const { m, fmt, plural } = i;
  const amount = (n: number) => (r.unit === "points" ? plural(m.dashboard.pointsN, n) : plural(m.sprint.tasks, n));
  const sp = r.sprint;
  const left = daysBetween(today(), sp.endDate!);
  const max = Math.max(1, ...r.days.map((d) => Math.max(d.remaining ?? 0, d.ideal)));
  const w = Math.max(1, r.days.length - 1);
  const line = (pts: [number, number | null][]) =>
    pts.filter((p): p is [number, number] => p[1] !== null).map(([x, y]) => `${x},${max - y}`).join(" ");
  const actual = r.days.map((d, k) => [k, d.remaining] as [number, number | null]);
  const last = actual.filter((p) => p[1] !== null).at(-1);
  const todayAt = daysBetween(sp.startDate!, today());
  const status = r.behind > 0 ? fmt(m.dashboard.behind, { n: amount(r.behind) }) : r.behind < 0 ? fmt(m.dashboard.ahead, { n: amount(-r.behind) }) : m.dashboard.onTrack;
  const id = `sprint-${sp.id}`;
  return (
    <section className="card p-5" aria-labelledby={id}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 id={id} className="flex flex-wrap items-center gap-2 font-semibold">
            <Flag size={15} className="text-brand" aria-hidden /> {sp.name}
            <span className="tag bg-surface-2 text-ink-2">
              {r.projectKey} · {r.projectName}
            </span>
          </h3>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-ink-2">
            <span>
              {i.day(sp.startDate!)} – {i.day(sp.endDate!)}
            </span>
            <span className={left < 0 ? "font-medium text-danger" : undefined}>
              {left > 0 ? plural(m.sprint.daysLeft, left) : left === 0 ? m.sprint.endsToday : plural(m.sprint.daysOver, -left)}
            </span>
          </p>
          {sp.goal && (
            <p className="mt-1 text-sm">
              <span className="font-medium">{m.sprint.goal}:</span> {sp.goal}
            </p>
          )}
        </div>
        <Link href={`/projects/${r.projectKey}/backlog`} className="btn btn-sm">
          {m.dashboard.openPlanning}
        </Link>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-ink-2">{m.dashboard.remaining}</dt>
          <dd className="text-xl font-semibold tabular-nums">{amount(r.remaining)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-2">{m.dashboard.scope}</dt>
          <dd className="text-xl font-semibold tabular-nums">{amount(r.total)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-2">{m.dashboard.doneTasks}</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {i.num(r.done)}/{i.num(r.count)}
          </dd>
        </div>
        <div className="self-center">
          <dt className="sr-only">{m.dashboard.burndown}</dt>
          <dd>
            <span className={`tag ${r.behind > 0 ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>{status}</span>
          </dd>
        </div>
      </dl>

      <h4 className="mt-5 text-xs font-medium text-ink-2">{m.dashboard.burndown}</h4>
      <div className="mt-6 grid grid-cols-[auto_1fr] gap-x-2">
        <div className="flex h-44 flex-col justify-between text-right text-[11px] leading-none text-ink-3 tabular-nums" aria-hidden>
          <span>{i.num(Math.round(max * 10) / 10)}</span>
          <span>0</span>
        </div>
        <div className="relative h-44 flex-1 border-b border-l border-line">
          <svg viewBox={`0 0 ${w} ${max}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <line x1={0} x2={w} y1={max / 2} y2={max / 2} className="stroke-line" vectorEffect="non-scaling-stroke" />
            {todayAt >= 0 && todayAt <= w && (
              <line x1={todayAt} x2={todayAt} y1={0} y2={max} className="stroke-ink-3" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            )}
            <polyline
              points={line(r.days.map((d, k) => [k, d.ideal]))}
              fill="none"
              className="stroke-ink-3"
              strokeWidth={1.5}
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
            <polyline points={line(actual)} fill="none" className="stroke-brand" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {/* A zero-length round-capped stroke stays a circle although the chart is stretched. */}
            {last && <path d={`M${last[0]} ${max - last[1]!}h0`} className="stroke-brand" strokeWidth={8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
          </svg>
          {todayAt >= 0 && todayAt <= w && (
            <span
              className="absolute -top-5 -translate-x-1/2 text-[11px] text-ink-3"
              style={{ left: `${(todayAt / w) * 100}%` }}
              aria-hidden
            >
              {m.dashboard.today}
            </span>
          )}
        </div>
        <div className="col-start-2 mt-1 flex justify-between text-[11px] text-ink-3" aria-hidden>
          <span>{i.day(r.days[0].date)}</span>
          <span>{i.day(r.days.at(-1)!.date)}</span>
        </div>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded bg-brand" aria-hidden /> {m.dashboard.remaining}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 border-t-2 border-dashed border-ink-3" aria-hidden /> {m.dashboard.ideal}
        </span>
        <span className="text-ink-3">
          {r.unit === "points" ? m.dashboard.unitPoints : m.dashboard.unitTasks} {m.dashboard.scopeNote}
        </span>
      </p>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-2 hover:text-ink">{m.dashboard.showTable}</summary>
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full text-left">
            <thead className="text-xs text-ink-2">
              <tr>
                <th className="py-1 font-medium">{m.dashboard.date}</th>
                <th className="py-1 text-right font-medium">{m.dashboard.remaining}</th>
                <th className="py-1 text-right font-medium">{m.dashboard.ideal}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {r.days.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="py-1">{i.day(d.date, { weekday: "short", day: "numeric", month: "short" })}</td>
                  <td className="py-1 text-right">{d.remaining === null ? "–" : i.num(d.remaining)}</td>
                  <td className="py-1 text-right">{i.num(Math.round(d.ideal * 10) / 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
