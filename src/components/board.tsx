"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckSquare, Download, GripVertical, KanbanSquare, List, MessageSquare, Plus, Settings2, UserPlus, X } from "lucide-react";
import { assignTaskAction, createTaskAction, moveTaskAction } from "@/app/actions";
import { today, weekStart, addDays } from "@/lib/dates";
import { fold } from "@/lib/fold";
import { useI18n } from "@/lib/i18n/client";
import type { Board as BoardData, BoardTask } from "@/server/projects";
import { Dialog, useRun, useToast } from "./client";
import { Avatar, AvatarStack, DueBadge, EmptyState, PriorityIcon } from "./ui";

export type BoardPerms = { create: boolean; editAny: boolean; assignSelf: boolean; assignOthers: boolean; manage: boolean };
type Column = BoardData["columns"][number];
type Items = Record<string, string[]>;
type Filters = { mine: boolean; unassigned: boolean; overdue: boolean; week: boolean; people: string[]; label: string; priority: string; text: string };

const NO_FILTERS: Filters = { mine: false, unassigned: false, overdue: false, week: false, people: [], label: "", priority: "", text: "" };
const PRIORITIES = ["highest", "high", "medium", "low", "lowest"] as const;

function applyFilters(tasks: BoardTask[], f: Filters, me: string, doneCols: Set<string>) {
  const t0 = today();
  const weekEnd = addDays(weekStart(t0), 6);
  const q = fold(f.text.trim());
  return tasks.filter(
    (t) =>
      (!f.mine || t.assigneeIds.includes(me)) &&
      (!f.unassigned || !t.assigneeIds.length) &&
      (!f.overdue || (!!t.dueDate && t.dueDate < t0 && !doneCols.has(t.columnId))) &&
      (!f.week || (!!t.dueDate && t.dueDate >= weekStart(t0) && t.dueDate <= weekEnd)) &&
      (!f.people.length || f.people.some((p) => t.assigneeIds.includes(p))) &&
      (!f.label || t.labels.includes(f.label)) &&
      (!f.priority || t.priority === f.priority) &&
      (!q || t.searchText.includes(q)),
  );
}

export function Board({
  board,
  me,
  perms,
  view,
}: {
  board: BoardData;
  me: string;
  perms: BoardPerms;
  view: "board" | "list";
}) {
  const i = useI18n();
  const { m, fmt, plural } = i;
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const { run } = useRun();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [creating, setCreating] = useState<string | null>(params.get("new") ? board.columns[0]?.id ?? null : null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, number>>({});

  const people = board.people;
  const byId = useMemo(() => new Map(board.tasks.map((t) => [t.id, t])), [board.tasks]);
  const doneCols = useMemo(() => new Set(board.columns.filter((c) => c.category === "done").map((c) => c.id)), [board.columns]);
  const labels = useMemo(() => [...new Set(board.tasks.flatMap((t) => t.labels))].sort((a, b) => a.localeCompare(b, i.tag)), [board.tasks, i.tag]);
  const visible = useMemo(() => applyFilters(board.tasks, filters, me, doneCols), [board.tasks, filters, me, doneCols]);
  const derived = useMemo(() => {
    const items: Items = Object.fromEntries(board.columns.map((c) => [c.id, [] as string[]]));
    for (const t of visible) items[t.columnId]?.push(t.id);
    return items;
  }, [visible, board.columns]);
  // Local order while dragging and until the server's fresh board arrives (then `derived` changes).
  const [local, setLocal] = useState<{ base: Items; items: Items } | null>(null);
  const items = local && local.base === derived ? local.items : derived;
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  useEffect(() => {
    const onNew = () => perms.create && setCreating(board.columns[0]?.id ?? null);
    window.addEventListener("pano:new-task", onNew);
    return () => window.removeEventListener("pano:new-task", onNew);
  }, [board.columns, perms.create]);

  const sensors = useSensors(
    // Mouse and touch are separate so a finger swipe scrolls the board and a long press drags.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const canEdit = (t: BoardTask) => perms.editAny || (perms.create && (t.reporterId === me || t.assigneeIds.includes(me)));
  const containerOf = (id: string, its: Items) => (id in its ? id : Object.keys(its).find((c) => its[c].includes(id)));
  const colName = (id: string | undefined) => {
    const c = board.columns.find((x) => x.id === id);
    return c ? i.columnName(c) : "";
  };
  const keyOf = (id: string | number) => byId.get(String(id))?.key ?? "";

  const announcements: Announcements = {
    onDragStart: ({ active }) => fmt(m.board.dndStart, { key: keyOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? fmt(m.board.dndOver, { key: keyOf(active.id), column: colName(containerOf(String(over.id), items)) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? fmt(m.board.dndEnd, { key: keyOf(active.id), column: colName(containerOf(String(over.id), items)) }) : m.board.dndCancel),
    onDragCancel: () => m.board.dndCancel,
  };

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setLocal({ base: derived, items });
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = containerOf(String(active.id), items);
    const to = containerOf(String(over.id), items);
    if (!from || !to || from === to) return;
    const toList = items[to];
    const overIndex = toList.indexOf(String(over.id));
    const index = overIndex >= 0 ? overIndex : toList.length;
    setLocal({
      base: derived,
      items: {
        ...items,
        [from]: items[from].filter((x) => x !== active.id),
        [to]: [...toList.slice(0, index), String(active.id), ...toList.slice(index)],
      },
    });
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const id = String(active.id);
    const task = byId.get(id);
    const col = containerOf(id, items);
    if (!over || !task || !col) return setLocal(null);
    let list = items[col];
    const overIndex = list.indexOf(String(over.id));
    const oldIndex = list.indexOf(id);
    if (overIndex >= 0 && overIndex !== oldIndex) list = arrayMove(list, oldIndex, overIndex);
    const next = { ...items, [col]: list };
    setLocal({ base: derived, items: next });
    const original = derived[task.columnId] ?? [];
    if (col === task.columnId && original.indexOf(id) === list.indexOf(id)) return;
    // Hidden (filtered-out) cards keep their place: position relative to the full column.
    const full = board.tasks.filter((t) => t.columnId === col && t.id !== id).map((t) => t.id);
    const at = list.indexOf(id);
    const pred = list[at - 1];
    const succ = list[at + 1];
    const index = pred ? full.indexOf(pred) + 1 : succ ? full.indexOf(succ) : full.length;
    const version = Math.max(task.version, versions[id] ?? 0);
    const r = await moveTaskAction({ taskId: id, version, columnId: col, index }).catch(() => null);
    if (!r?.ok) {
      setLocal(null);
      toast(r ? (m.errors[r.error] ?? m.errors.generic) : m.errors.generic, "error");
      return;
    }
    setVersions((v) => ({ ...v, [id]: r.data.version }));
    if (col !== task.columnId) toast(fmt(m.board.moved, { key: task.key, column: colName(col) }));
  }

  const openHref = (key: string) => `${path}?task=${key}`;
  const toggle = (k: "mine" | "unassigned" | "overdue" | "week") => setFilters((f) => ({ ...f, [k]: !f[k] }));
  const activeTask = activeId ? byId.get(activeId) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <h1 className="flex items-center gap-2 page-title">
            <span className="shrink-0 rounded bg-brand-soft px-1.5 py-0.5 text-sm font-bold">{board.project.key}</span>
            <span className="truncate">{board.project.name}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex rounded-md border border-line bg-surface p-0.5" aria-label={m.board.viewBoard + " / " + m.board.viewList}>
            <Link
              href={`/projects/${board.project.key}`}
              aria-current={view === "board" ? "page" : undefined}
              className="flex min-h-8 items-center gap-1.5 rounded px-2.5 text-[13px] font-medium text-ink-2 aria-[current=page]:bg-brand-soft aria-[current=page]:text-ink"
            >
              <KanbanSquare size={15} aria-hidden /> {m.board.viewBoard}
            </Link>
            <Link
              href={`/projects/${board.project.key}/list`}
              aria-current={view === "list" ? "page" : undefined}
              className="flex min-h-8 items-center gap-1.5 rounded px-2.5 text-[13px] font-medium text-ink-2 aria-[current=page]:bg-brand-soft aria-[current=page]:text-ink"
            >
              <List size={15} aria-hidden /> {m.board.viewList}
            </Link>
          </nav>
          <a href={`/projects/${board.project.key}/export`} className="btn btn-ghost" title={m.board.exportCsv} aria-label={m.board.exportCsv}>
            <Download size={16} aria-hidden />
            <span className="max-lg:sr-only">{m.board.exportCsv}</span>
          </a>
          {perms.manage && (
            <Link href={`/projects/${board.project.key}/settings`} className="btn btn-ghost" title={m.board.projectSettings} aria-label={m.board.projectSettings}>
              <Settings2 size={16} aria-hidden />
            </Link>
          )}
          {perms.create && (
            <button className="btn btn-primary" onClick={() => setCreating(board.columns[0]?.id ?? null)} aria-keyshortcuts="c">
              <Plus size={16} aria-hidden /> {m.board.newTask}
            </button>
          )}
        </div>
      </div>

      <div
        className="relative -mx-4 mb-4 flex items-center gap-2 overflow-x-auto px-4 py-0.5 *:shrink-0 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        role="group"
        aria-label={m.board.filters}
      >
        <label htmlFor="board-filter" className="sr-only">
          {m.board.filterText}
        </label>
        <input
          id="board-filter"
          type="search"
          className="input w-44 min-h-8 py-1"
          placeholder={m.board.filterText}
          value={filters.text}
          onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))}
        />
        <div className="flex -space-x-1" role="group" aria-label={m.task.assignees}>
          {people.slice(0, 8).map((p) => {
            const on = filters.people.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                aria-label={fmt(m.board.filterAssignee, { name: p.name })}
                title={p.name}
                onClick={() => setFilters((f) => ({ ...f, people: on ? f.people.filter((x) => x !== p.id) : [...f.people, p.id] }))}
                className={`rounded-full transition-transform hover:z-10 hover:-translate-y-0.5 ${on ? "z-10 outline-2 outline-offset-1 outline-brand" : ""}`}
              >
                <Avatar id={p.id} name={p.name} size={30} title="" />
              </button>
            );
          })}
        </div>
        <button type="button" className="chip" aria-pressed={filters.mine} onClick={() => toggle("mine")}>
          {m.board.myTasks}
        </button>
        <button type="button" className="chip" aria-pressed={filters.unassigned} onClick={() => toggle("unassigned")}>
          {m.board.unassigned}
        </button>
        <button type="button" className="chip" aria-pressed={filters.overdue} onClick={() => toggle("overdue")}>
          {m.board.overdue}
        </button>
        <button type="button" className="chip" aria-pressed={filters.week} onClick={() => toggle("week")}>
          {m.board.dueThisWeek}
        </button>
        <label className="sr-only" htmlFor="f-label">
          {m.task.labels}
        </label>
        <select id="f-label" className="input min-h-8 w-auto py-1" value={filters.label} onChange={(e) => setFilters((f) => ({ ...f, label: e.target.value }))}>
          <option value="">{m.board.anyLabel}</option>
          {labels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="f-priority">
          {m.priority.label}
        </label>
        <select id="f-priority" className="input min-h-8 w-auto py-1" value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
          <option value="">{m.board.anyPriority}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {m.priority[p]}
            </option>
          ))}
        </select>
        {filtered && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters(NO_FILTERS)}>
              <X size={14} aria-hidden /> {m.board.clear}
            </button>
            <span className="text-xs text-ink-3" role="status">
              {plural(m.board.shown, visible.length)}
            </span>
          </>
        )}
      </div>

      {!board.tasks.length && view === "list" ? (
        <EmptyState title={m.board.emptyProjectTitle} lead={m.board.emptyProjectLead} icon={<KanbanSquare size={28} />}>
          {perms.create && (
            <button className="btn btn-primary" onClick={() => setCreating(board.columns[0]?.id ?? null)}>
              <Plus size={16} aria-hidden /> {m.board.newTask}
            </button>
          )}
        </EmptyState>
      ) : view === "list" ? (
        <ListView board={board} visible={visible} openHref={openHref} />
      ) : (
        <DndContext
          id="board"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setLocal(null);
          }}
          accessibility={{ announcements, screenReaderInstructions: { draggable: m.board.dragHint } }}
        >
          <div className="relative -mx-4 flex flex-1 snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:snap-none md:px-8">
            {board.columns.map((c) => (
              <ColumnView key={c.id} column={c} name={i.columnName(c)} ids={items[c.id] ?? []} total={board.tasks.filter((t) => t.columnId === c.id).length} filtered={filtered}>
                {(items[c.id] ?? []).map((id) => {
                  const t = byId.get(id);
                  return t ? (
                    <SortableCard
                      key={id}
                      task={t}
                      done={doneCols.has(c.id)}
                      draggable={canEdit(t)}
                      href={openHref(t.key)}
                      people={people}
                      canAssignSelf={perms.assignSelf && !t.assigneeIds.includes(me)}
                      onAssignSelf={() => run(() => assignTaskAction({ taskId: t.id, userId: me }))}
                    />
                  ) : null;
                })}
              </ColumnView>
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeTask ? <CardBody task={activeTask} done={false} people={people} lifted /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {perms.create && (
        <CreateTaskDialog
          open={!!creating}
          columnId={creating}
          onClose={() => {
            setCreating(null);
            if (params.get("new")) router.replace(path, { scroll: false });
          }}
          board={board}
          me={me}
          perms={perms}
        />
      )}
    </div>
  );
}

function ColumnView({ column, name, ids, total, filtered, children }: { column: Column; name: string; ids: string[]; total: number; filtered: boolean; children: React.ReactNode }) {
  const { m, fmt } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const over = column.wipLimit != null && total > column.wipLimit;
  const stripe = column.category === "done" ? "bg-ok/70" : column.category === "doing" ? "bg-brand" : "bg-ink-3/40";
  return (
    <section
      aria-label={name}
      className={`flex w-[85vw] max-w-[20rem] shrink-0 snap-start flex-col rounded-lg border sm:w-72 ${
        over ? "border-warn-line bg-warn-soft" : "border-transparent bg-surface-2"
      } ${isOver ? "ring-2 ring-brand/50" : ""}`}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className={`h-3.5 w-1 rounded-full ${stripe}`} aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</h2>
        <span
          className={`rounded-full px-2 text-xs font-semibold tabular-nums ${over ? "bg-warn-line text-[#3b2503]" : "bg-surface text-ink-2"}`}
          title={over ? fmt(m.board.wipExceeded, { count: total, limit: column.wipLimit! }) : undefined}
        >
          {column.wipLimit != null ? fmt(m.board.wipOf, { count: total, limit: column.wipLimit }) : filtered ? `${ids.length}/${total}` : total}
          {over && <span className="sr-only"> {fmt(m.board.wipExceeded, { count: total, limit: column.wipLimit! })}</span>}
        </span>
      </header>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
          {children}
          {!ids.length && <li className="rounded-md border border-dashed border-line px-3 py-6 text-center text-xs text-ink-3">{filtered ? m.board.noMatches : m.board.emptyColumn}</li>}
        </ol>
      </SortableContext>
    </section>
  );
}

function SortableCard({
  task,
  done,
  draggable,
  href,
  people,
  canAssignSelf,
  onAssignSelf,
}: {
  task: BoardTask;
  done: boolean;
  draggable: boolean;
  href: string;
  people: { id: string; name: string }[];
  canAssignSelf: boolean;
  onAssignSelf: () => void;
}) {
  const { m, fmt } = useI18n();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !draggable });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative ${isDragging ? "opacity-40" : ""}`}
      onMouseDown={listeners?.onMouseDown as React.MouseEventHandler | undefined}
      onTouchStart={listeners?.onTouchStart as React.TouchEventHandler | undefined}
    >
      <CardBody task={task} done={done} people={people} href={href} />
      <div className="absolute top-1.5 right-1.5 flex gap-0.5">
        {canAssignSelf && (
          <button
            type="button"
            onClick={onAssignSelf}
            className="rounded p-1 text-ink-3 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 [@media(hover:none)]:hidden"
            aria-label={`${m.task.assignToMe}: ${task.key}`}
            title={m.task.assignToMe}
          >
            <UserPlus size={15} aria-hidden />
          </button>
        )}
        {draggable && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            onKeyDown={listeners?.onKeyDown as React.KeyboardEventHandler | undefined}
            aria-label={fmt(m.board.dragHandle, { key: task.key })}
            className="cursor-grab rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <GripVertical size={15} aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}

function CardBody({ task, done, people, href, lifted }: { task: BoardTask; done: boolean; people: { id: string; name: string }[]; href?: string; lifted?: boolean }) {
  const i = useI18n();
  const { m } = i;
  const assignees = task.assigneeIds.map((id) => people.find((p) => p.id === id) ?? { id, name: m.common.unknownUser });
  return (
    <div className={`rounded-md border border-line bg-surface p-2.5 shadow-card ${lifted ? "rotate-1 shadow-lift" : "hover:border-ink-3/50"}`}>
      <p className="pr-12 text-[11px] font-semibold text-ink-3 tabular-nums">{task.key}</p>
      {href ? (
        <Link href={href} scroll={false} draggable={false} className="mt-0.5 block pr-6 text-sm leading-snug font-medium text-ink after:absolute after:inset-0 after:content-[''] hover:underline">
          {task.title}
        </Link>
      ) : (
        <p className="mt-0.5 text-sm leading-snug font-medium">{task.title}</p>
      )}
      {task.labels.length > 0 && (
        <p className="mt-1.5 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <span key={l} className="tag bg-brand-soft text-ink">
              {l}
            </span>
          ))}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs whitespace-nowrap text-ink-2">
        <PriorityIcon priority={task.priority} label={m.priority[task.priority as "medium"]} size={15} />
        {task.dueDate && <DueBadge ymd={task.dueDate} done={done} i={i} />}
        {task.checklistTotal > 0 && (
          <span className={`flex items-center gap-0.5 ${task.checklistDone === task.checklistTotal ? "text-ok" : ""}`} title={m.task.checklist}>
            <CheckSquare size={13} aria-hidden />
            <span className="tabular-nums">
              {task.checklistDone}/{task.checklistTotal}
            </span>
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="flex items-center gap-0.5" title={i.plural(m.task.commentsCount, task.commentCount)}>
            <MessageSquare size={13} aria-hidden />
            <span className="tabular-nums">{task.commentCount}</span>
          </span>
        )}
        {task.estimate != null && (
          <span className="rounded bg-surface-2 px-1.5 font-semibold tabular-nums" title={m.task.estimate}>
            {i.num(task.estimate)}
          </span>
        )}
        <span className="ml-auto">
          <AvatarStack people={assignees} size={22} />
        </span>
      </div>
    </div>
  );
}

function ListView({ board, visible, openHref }: { board: BoardData; visible: BoardTask[]; openHref: (k: string) => string }) {
  const i = useI18n();
  const { m } = i;
  const order = new Map(board.columns.map((c, idx) => [c.id, idx]));
  const rows = [...visible].sort((a, b) => order.get(a.columnId)! - order.get(b.columnId)! || a.position - b.position);
  const done = new Set(board.columns.filter((c) => c.category === "done").map((c) => c.id));
  if (!rows.length) return <EmptyState title={m.board.noMatches} />;
  return (
    <div className="card relative overflow-x-auto">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="border-b border-line bg-surface-2 text-left text-xs text-ink-2">
          <tr>
            <th className="w-20 px-3 py-2 font-medium">{m.list.key}</th>
            <th className="px-3 py-2 font-medium">{m.list.task}</th>
            <th className="px-3 py-2 font-medium">{m.list.status}</th>
            <th className="px-3 py-2 font-medium">{m.list.assignees}</th>
            <th className="px-3 py-2 font-medium">{m.list.due}</th>
            <th className="px-3 py-2 text-right font-medium">{m.list.estimate}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((t) => {
            const col = board.columns.find((c) => c.id === t.columnId)!;
            return (
              <tr key={t.id} className="hover:bg-surface-2">
                <td className="px-3 py-2 text-xs font-semibold text-ink-3 tabular-nums">{t.key}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <PriorityIcon priority={t.priority} label={m.priority[t.priority as "medium"]} />
                    <Link href={openHref(t.key)} scroll={false} className="font-medium hover:underline">
                      {t.title}
                    </Link>
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-ink-2">{i.columnName(col)}</td>
                <td className="px-3 py-2">
                  <AvatarStack people={t.assigneeIds.map((id) => board.people.find((p) => p.id === id) ?? { id, name: m.common.unknownUser })} size={22} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{t.dueDate ? <DueBadge ymd={t.dueDate} done={done.has(t.columnId)} i={i} /> : null}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.estimate != null ? i.num(t.estimate) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CreateTaskDialog({
  open,
  columnId,
  onClose,
  board,
  me,
  perms,
}: {
  open: boolean;
  columnId: string | null;
  onClose: () => void;
  board: BoardData;
  me: string;
  perms: BoardPerms;
}) {
  const i = useI18n();
  const { m, fmt } = i;
  const { run, pending } = useRun();
  const toast = useToast();
  return (
    <Dialog open={open} onClose={onClose} title={m.task.createTitle} wide>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const est = String(fd.get("estimate") ?? "");
          const input = {
            projectId: board.project.id,
            columnId: String(fd.get("columnId")),
            title: String(fd.get("title")),
            description: String(fd.get("description") ?? ""),
            priority: String(fd.get("priority")),
            dueDate: String(fd.get("dueDate") ?? "") || null,
            estimate: est ? Number(est) : null,
            labels: String(fd.get("labels") ?? "")
              .split(",")
              .map((l) => l.trim())
              .filter(Boolean),
            assigneeIds: fd.get("assignMe") === "on" ? [me] : [],
          };
          const r = await run(() => createTaskAction(input));
          if (r?.ok) {
            onClose();
            toast(fmt(m.task.created, { key: r.data.key }));
          }
        }}
      >
        <div className="sm:col-span-2">
          <label className="label" htmlFor="t-title">
            {m.task.title}
          </label>
          <input id="t-title" name="title" className="input" required maxLength={200} placeholder={m.task.titlePlaceholder} autoFocus />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="t-desc">
            {m.task.description} <span className="font-normal text-ink-3">({m.common.optional})</span>
          </label>
          <textarea id="t-desc" name="description" rows={4} className="input" maxLength={20000} placeholder={m.task.descriptionPlaceholder} />
        </div>
        <div>
          <label className="label" htmlFor="t-col">
            {m.task.createIn}
          </label>
          <select id="t-col" name="columnId" className="input" defaultValue={columnId ?? undefined}>
            {board.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {i.columnName(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="t-pri">
            {m.priority.label}
          </label>
          <select id="t-pri" name="priority" className="input" defaultValue="medium">
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {m.priority[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="t-due">
            {m.task.dueDate}
          </label>
          <input id="t-due" name="dueDate" type="date" className="input" lang={i.tag} />
        </div>
        <div>
          <label className="label" htmlFor="t-est">
            {m.task.estimate}
          </label>
          <input id="t-est" name="estimate" type="number" min={0} max={1000} step="0.5" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="t-labels">
            {m.task.labels} <span className="font-normal text-ink-3">({m.task.labelsHint})</span>
          </label>
          <input id="t-labels" name="labels" className="input" maxLength={300} />
        </div>
        {perms.assignSelf && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="assignMe" className="size-4 accent-[var(--brand)]" />
            {m.task.alsoAssignMe}
          </label>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn" onClick={onClose}>
            {m.common.cancel}
          </button>
          <button className="btn btn-primary" disabled={pending}>
            {m.task.createSubmit}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
