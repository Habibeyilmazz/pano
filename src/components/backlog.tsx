"use client";
import Link from "next/link";
import { useState } from "react";
import { CalendarRange, CheckCircle2, Flag, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { completeSprintAction, createSprintAction, deleteSprintAction, startSprintAction, updateSprintAction, updateTaskAction } from "@/app/actions";
import { addDays, daysBetween, today } from "@/lib/dates";
import { useI18n } from "@/lib/i18n/client";
import type { Board as BoardData, BoardTask, Sprint } from "@/server/projects";
import { Dialog, useRun, useToast } from "./client";
import { AvatarStack, EmptyState, PriorityIcon } from "./ui";

const points = (ts: BoardTask[]) => ts.reduce((n, t) => n + (t.estimate ?? 0), 0);

function useSprintText() {
  const i = useI18n();
  const { m, fmt, plural } = i;
  return {
    dates: (sp: Sprint) => (sp.startDate && sp.endDate ? `${i.day(sp.startDate)} – ${i.day(sp.endDate)}` : m.sprint.noDates),
    left: (sp: Sprint) => {
      if (!sp.endDate) return null;
      const d = daysBetween(today(), sp.endDate);
      return d > 0 ? plural(m.sprint.daysLeft, d) : d === 0 ? m.sprint.endsToday : plural(m.sprint.daysOver, -d);
    },
    progress: (ts: BoardTask[], done: (t: BoardTask) => boolean) => {
      const finished = ts.filter(done);
      const total = points(ts);
      return {
        ratio: total ? points(finished) / total : ts.length ? finished.length / ts.length : 0,
        text: [fmt(m.sprint.progress, { done: finished.length, total: ts.length }), total ? fmt(m.sprint.pointsProgress, { done: i.num(points(finished)), total: i.num(total) }) : null]
          .filter(Boolean)
          .join(" · "),
      };
    },
  };
}

function Progress({ ratio, label }: { ratio: number; label: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label={label}>
      <div className="h-1.5 rounded-full bg-ok/70" style={{ width: `${Math.round(ratio * 100)}%` }} />
    </div>
  );
}

/** One line above the board while it shows a running sprint: dates, countdown, goal and progress. */
export function SprintBar({ sprint, tasks, isDone }: { sprint: Sprint; tasks: BoardTask[]; isDone: (t: BoardTask) => boolean }) {
  const { m } = useI18n();
  const st = useSprintText();
  const p = st.progress(tasks, isDone);
  const left = st.left(sprint);
  const late = !!sprint.endDate && sprint.endDate < today();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px]">
      <span className="flex items-center gap-1.5 font-semibold">
        <Flag size={14} className="text-brand" aria-hidden /> {sprint.name}
      </span>
      <span className="text-ink-2">{st.dates(sprint)}</span>
      {left && <span className={late ? "font-medium text-danger" : "text-ink-2"}>{left}</span>}
      {sprint.goal && (
        <span className="min-w-0 basis-full text-ink-2 md:basis-auto md:flex-1 md:truncate" title={sprint.goal}>
          <span className="font-medium text-ink">{m.sprint.goal}:</span> {sprint.goal}
        </span>
      )}
      <span className="flex items-center gap-2 max-md:basis-full md:ml-auto">
        <span className="shrink-0 text-ink-2 tabular-nums">{p.text}</span>
        <span className="w-28 shrink-0 max-md:flex-1">
          <Progress ratio={p.ratio} label={p.text} />
        </span>
      </span>
    </div>
  );
}

/** Sprint planning: open sprints, the backlog, and completed sprints with what they delivered. */
export function BacklogView({
  board,
  visible,
  manage,
  canEdit,
  openHref,
}: {
  board: BoardData;
  visible: BoardTask[];
  manage: boolean;
  canEdit: (t: BoardTask) => boolean;
  openHref: (key: string) => string;
}) {
  const i = useI18n();
  const { m, fmt, plural } = i;
  const st = useSprintText();
  const { run, pending } = useRun();
  const [dialog, setDialog] = useState<{ mode: "create" | "edit" | "start" | "complete"; sprint?: Sprint } | null>(null);
  const doneCols = new Set(board.columns.filter((c) => c.category === "done").map((c) => c.id));
  const isDone = (t: BoardTask) => doneCols.has(t.columnId);
  const open = board.sprints.filter((s) => s.state !== "closed").sort((a, b) => Number(b.state === "active") - Number(a.state === "active"));
  const closed = board.sprints.filter((s) => s.state === "closed").reverse();
  const active = open.find((s) => s.state === "active");
  const backlog = visible.filter((t) => !t.sprintId && !isDone(t));

  const order = new Map(board.columns.map((c, idx) => [c.id, idx]));
  const rows = (ts: BoardTask[], empty: string) =>
    ts.length ? (
      <ul className="divide-y divide-line">
        {[...ts].sort((a, b) => order.get(a.columnId)! - order.get(b.columnId)! || a.position - b.position).map((t) => (
          <TaskRow key={t.id} task={t} board={board} open={open} editable={canEdit(t)} done={isDone(t)} href={openHref(t.key)} />
        ))}
      </ul>
    ) : (
      <p className="px-3 py-4 text-sm text-ink-3">{empty}</p>
    );

  return (
    <div className="space-y-5">
      {manage && (
        <div className="flex justify-end">
          <button className="btn" onClick={() => setDialog({ mode: "create" })}>
            <Plus size={16} aria-hidden /> {m.sprint.newSprint}
          </button>
        </div>
      )}
      {!board.sprints.length && (
        <EmptyState title={m.sprint.noSprintsTitle} lead={m.sprint.noSprintsLead} icon={<CalendarRange size={28} />}>
          {manage && (
            <button className="btn btn-primary" onClick={() => setDialog({ mode: "create" })}>
              <Plus size={16} aria-hidden /> {m.sprint.newSprint}
            </button>
          )}
        </EmptyState>
      )}

      {open.map((sp) => {
        const all = board.tasks.filter((t) => t.sprintId === sp.id);
        const shown = visible.filter((t) => t.sprintId === sp.id);
        const p = st.progress(all, isDone);
        const left = sp.state === "active" ? st.left(sp) : null;
        return (
          <section key={sp.id} aria-labelledby={`sp-${sp.id}`} className={`card overflow-hidden ${sp.state === "active" ? "border-brand/60" : ""}`}>
            <header className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-line bg-surface-2/60 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <h2 id={`sp-${sp.id}`} className="flex flex-wrap items-center gap-2 section-title">
                  {sp.name}
                  <span className={`tag ${sp.state === "active" ? "bg-brand-soft text-ink" : "bg-surface text-ink-2"}`}>{m.sprint.states[sp.state as "planned"]}</span>
                </h2>
                <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-ink-2">
                  <span>{st.dates(sp)}</span>
                  {left && <span>{left}</span>}
                  <span>
                    {plural(m.sprint.tasks, all.length)} · {fmt(m.sprint.points, { n: i.num(points(all)) })}
                  </span>
                </p>
                {sp.goal && (
                  <p className="mt-1 text-sm">
                    <span className="font-medium">{m.sprint.goal}:</span> {sp.goal}
                  </p>
                )}
              </div>
              {manage && (
                <div className="flex flex-wrap items-center gap-1">
                  {sp.state === "planned" && (
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={!!active}
                      title={active ? m.sprint.otherActive : undefined}
                      onClick={() => setDialog({ mode: "start", sprint: sp })}
                    >
                      <Play size={14} aria-hidden /> {m.sprint.start}
                    </button>
                  )}
                  {sp.state === "active" && (
                    <button className="btn btn-sm btn-primary" onClick={() => setDialog({ mode: "complete", sprint: sp })}>
                      <CheckCircle2 size={14} aria-hidden /> {m.sprint.complete}
                    </button>
                  )}
                  <button className="btn btn-sm btn-ghost" aria-label={`${m.sprint.edit}: ${sp.name}`} title={m.sprint.edit} onClick={() => setDialog({ mode: "edit", sprint: sp })}>
                    <Pencil size={14} aria-hidden />
                  </button>
                  {sp.state === "planned" && (
                    <button
                      className="btn btn-sm btn-ghost text-danger"
                      aria-label={`${m.sprint.delete}: ${sp.name}`}
                      title={m.sprint.delete}
                      disabled={pending}
                      onClick={() => confirm(fmt(m.sprint.confirmDelete, { name: sp.name })) && run(() => deleteSprintAction({ sprintId: sp.id }))}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  )}
                </div>
              )}
              {sp.state === "active" && all.length > 0 && (
                <div className="flex basis-full items-center gap-2 text-[13px] text-ink-2">
                  <span className="shrink-0 tabular-nums">{p.text}</span>
                  <Progress ratio={p.ratio} label={p.text} />
                </div>
              )}
            </header>
            {rows(shown, all.length ? m.board.noMatches : m.sprint.empty)}
          </section>
        );
      })}

      <section aria-labelledby="backlog-h" className="card overflow-hidden">
        <header className="border-b border-line bg-surface-2/60 px-3 py-2.5">
          <h2 id="backlog-h" className="flex items-center gap-2 section-title">
            {m.sprint.backlog}
            <span className="text-[13px] font-normal text-ink-2">
              {plural(m.sprint.tasks, backlog.length)} · {fmt(m.sprint.points, { n: i.num(points(backlog)) })}
            </span>
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-2">{m.sprint.backlogLead}</p>
        </header>
        {rows(backlog, m.sprint.backlogEmpty)}
      </section>

      {closed.length > 0 && (
        <section aria-labelledby="closed-h">
          <h2 id="closed-h" className="mb-2 section-title">
            {m.sprint.closedTitle}
          </h2>
          <ul className="card divide-y divide-line">
            {closed.map((sp) => {
              const done = board.tasks.filter((t) => t.sprintId === sp.id && isDone(t));
              return (
                <li key={sp.id} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-3 py-2 text-sm">
                  <span className="font-medium">{sp.name}</span>
                  <span className="text-ink-2">{st.dates(sp)}</span>
                  <span className="text-ink-2 sm:ml-auto">
                    {fmt(m.sprint.closedResult, { tasks: plural(m.sprint.tasks, done.length), points: fmt(m.sprint.points, { n: i.num(points(done)) }) })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {dialog && dialog.mode !== "complete" && <SprintDialog mode={dialog.mode} sprint={dialog.sprint} projectId={board.project.id} onClose={() => setDialog(null)} />}
      {dialog?.mode === "complete" && dialog.sprint && (
        <CompleteDialog sprint={dialog.sprint} board={board} planned={open.filter((s) => s.state === "planned")} isDone={isDone} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function TaskRow({ task: t, board, open, editable, done, href }: { task: BoardTask; board: BoardData; open: Sprint[]; editable: boolean; done: boolean; href: string }) {
  const i = useI18n();
  const { m, fmt } = i;
  const { run, pending } = useRun();
  const col = board.columns.find((c) => c.id === t.columnId);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-surface-2/60">
      <span className="w-16 shrink-0 text-xs font-semibold text-ink-3 tabular-nums">{t.key}</span>
      <PriorityIcon priority={t.priority} label={m.priority[t.priority as "medium"]} />
      <Link href={href} scroll={false} className={`min-w-0 flex-1 basis-40 font-medium hover:underline ${done ? "text-ink-2" : ""}`}>
        {t.title}
      </Link>
      <span className={`tag ${done ? "bg-ok-soft text-ok" : "bg-surface-2 text-ink-2"}`}>{col ? i.columnName(col) : ""}</span>
      <AvatarStack people={t.assigneeIds.map((id) => board.people.find((p) => p.id === id) ?? { id, name: m.common.unknownUser })} size={22} />
      <span className="w-8 text-right text-xs font-semibold tabular-nums text-ink-2" title={m.task.estimate}>
        {t.estimate != null ? i.num(t.estimate) : ""}
      </span>
      {editable && (
        <>
          <label className="sr-only" htmlFor={`sprint-${t.id}`}>
            {fmt(m.sprint.moveTask, { key: t.key })}
          </label>
          <select
            id={`sprint-${t.id}`}
            className="input min-h-8 w-52 py-1 max-sm:flex-1"
            value={t.sprintId ?? ""}
            disabled={pending}
            onChange={(e) => run(() => updateTaskAction({ taskId: t.id, version: t.version, sprintId: e.target.value || null }))}
          >
            <SprintOptions sprints={open} current={t.sprintId} />
          </select>
        </>
      )}
    </li>
  );
}

/** Options for a task's sprint: the backlog and every open sprint (the current one even if completed). */
export function SprintOptions({ sprints, current }: { sprints: Sprint[]; current: string | null }) {
  const { m, fmt } = useI18n();
  return (
    <>
      <option value="">{m.sprint.backlog}</option>
      {sprints
        .filter((s) => s.state !== "closed" || s.id === current)
        .map((s) => (
          <option key={s.id} value={s.id} disabled={s.state === "closed"}>
            {s.state === "active" ? fmt(m.sprint.activeOption, { name: s.name }) : s.name}
          </option>
        ))}
    </>
  );
}

function SprintDialog({ mode, sprint, projectId, onClose }: { mode: "create" | "edit" | "start"; sprint?: Sprint; projectId: string; onClose: () => void }) {
  const i = useI18n();
  const { m, fmt } = i;
  const { run, pending } = useRun();
  const toast = useToast();
  const t0 = today();
  // Starting a sprint begins it today; a planned end date is kept if it is still ahead.
  const start = mode === "start" ? t0 : (sprint?.startDate ?? "");
  const end = mode === "start" ? (sprint?.endDate && sprint.endDate >= t0 ? sprint.endDate : addDays(t0, 13)) : (sprint?.endDate ?? "");
  const title = mode === "create" ? m.sprint.newSprint : fmt(mode === "start" ? m.sprint.startTitle : m.sprint.editTitle, { name: sprint!.name });
  return (
    <Dialog open onClose={onClose} title={title}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const v = (k: string) => String(fd.get(k) ?? "").trim();
          const dates = { startDate: v("startDate") || null, endDate: v("endDate") || null, goal: v("goal") };
          if (mode === "create") {
            const r = await run(() => createSprintAction({ projectId, name: v("name") || undefined, ...dates }));
            if (r?.ok) {
              toast(fmt(m.sprint.created, { name: r.data.name }));
              onClose();
            }
            return;
          }
          const r =
            mode === "start"
                ? await run(() => startSprintAction({ sprintId: sprint!.id, ...dates }), fmt(m.sprint.started, { name: sprint!.name }))
                : await run(() => updateSprintAction({ sprintId: sprint!.id, name: v("name"), ...dates }), m.common.saved);
          if (r?.ok) onClose();
        }}
      >
        {mode !== "start" && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="sp-name">
              {m.sprint.name}
            </label>
            <input id="sp-name" name="name" className="input" maxLength={60} defaultValue={sprint?.name} required={mode === "edit"} placeholder={mode === "create" ? m.sprint.namePlaceholder : undefined} autoFocus />
          </div>
        )}
        {mode === "start" && <p className="text-sm text-ink-2 sm:col-span-2">{m.sprint.startLead}</p>}
        <div>
          <label className="label" htmlFor="sp-start">
            {m.sprint.startDate}
          </label>
          <input id="sp-start" name="startDate" type="date" lang={i.tag} className="input" defaultValue={start} required={mode === "start"} />
        </div>
        <div>
          <label className="label" htmlFor="sp-end">
            {m.sprint.endDate}
          </label>
          <input id="sp-end" name="endDate" type="date" lang={i.tag} className="input" defaultValue={end} required={mode === "start"} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="sp-goal">
            {m.sprint.goal} <span className="font-normal text-ink-3">({m.common.optional})</span>
          </label>
          <textarea id="sp-goal" name="goal" rows={2} className="input" maxLength={500} defaultValue={sprint?.goal} placeholder={m.sprint.goalPlaceholder} autoFocus={mode === "start"} />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn" onClick={onClose}>
            {m.common.cancel}
          </button>
          <button className="btn btn-primary" disabled={pending}>
            {mode === "create" ? m.common.create : mode === "start" ? m.sprint.start : m.common.save}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function CompleteDialog({ sprint, board, planned, isDone, onClose }: { sprint: Sprint; board: BoardData; planned: Sprint[]; isDone: (t: BoardTask) => boolean; onClose: () => void }) {
  const { m, fmt } = useI18n();
  const { run, pending } = useRun();
  const ts = board.tasks.filter((t) => t.sprintId === sprint.id);
  const open = ts.filter((t) => !isDone(t)).length;
  return (
    <Dialog open onClose={onClose} title={fmt(m.sprint.completeTitle, { name: sprint.name })}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const moveTo = String(new FormData(e.currentTarget).get("moveTo") ?? "") || null;
          const r = await run(() => completeSprintAction({ sprintId: sprint.id, moveTo }), fmt(m.sprint.completed, { name: sprint.name }));
          if (r?.ok) onClose();
        }}
      >
        <p className="text-sm">{fmt(m.sprint.completeLead, { done: ts.length - open, open })}</p>
        {open > 0 && (
          <div>
            <label className="label" htmlFor="sp-move">
              {m.sprint.moveOpenTo}
            </label>
            <select id="sp-move" name="moveTo" className="input" defaultValue={planned[0]?.id ?? ""}>
              <option value="">{m.sprint.backlog}</option>
              {planned.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            {m.common.cancel}
          </button>
          <button className="btn btn-primary" disabled={pending} autoFocus>
            {m.sprint.complete}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
