"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState } from "react";
import { Copy, Trash2, UserPlus, X } from "lucide-react";
import {
  addChecklistItemAction,
  addCommentAction,
  assignTaskAction,
  copyTaskAction,
  deleteChecklistItemAction,
  deleteTaskAction,
  moveTaskAction,
  toggleChecklistItemAction,
  unassignTaskAction,
  updateTaskAction,
} from "@/app/actions";
import { fold } from "@/lib/fold";
import { handleOf } from "@/lib/links";
import { useI18n } from "@/lib/i18n/client";
import type { TaskDetail } from "@/server/tasks";
import { activityText } from "./activity";
import { SprintOptions } from "./backlog";
import { CloseButton, useRun, useToast } from "./client";
import { Avatar, PriorityIcon } from "./ui";

type Person = TaskDetail["people"][number];

export type TaskPerms = { assignSelf: boolean; assignOthers: boolean; comment: boolean; delete: boolean; create: boolean };

// react-markdown and remark-gfm are a third of the board's JavaScript; load them when a task opens.
const Markdown = dynamic(() => import("./markdown"), { loading: () => <div className="prose-pano min-h-5" aria-busy="true" /> });

function SideField({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[13px] text-ink-2">
          {label}
        </label>
      ) : (
        <span className="text-[13px] text-ink-2">{label}</span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TaskPanel({ detail, me, perms }: { detail: TaskDetail; me: string; perms: TaskPerms }) {
  const i = useI18n();
  const { m, fmt } = i;
  const router = useRouter();
  const path = usePathname();
  const toast = useToast();
  const { run, pending } = useRun();
  const ref = useRef<HTMLDialogElement>(null);
  const t = detail.task;
  const [localVersion, setLocalVersion] = useState(0);
  const version = Math.max(t.version, localVersion);
  const editable = detail.canEdit;
  const people = detail.people;
  const person = (id: string) => people.find((p) => p.id === id);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Start focus on the panel itself, not on its first button.
    d?.focus();
  }, []);

  const close = () => router.push(path, { scroll: false });

  async function save(patch: Record<string, unknown>) {
    const r = await run(() => updateTaskAction({ taskId: t.id, version, ...patch }));
    if (r?.ok) setLocalVersion(r.data.version);
    return !!r?.ok;
  }

  const column = detail.columns.find((c) => c.id === t.columnId);
  const assignable = people.filter((p) => detail.assignable.includes(p.id) && !t.assigneeIds.includes(p.id));
  // Ticks show at once and roll back if the server refuses.
  const [checklist, tick] = useOptimistic(detail.checklist, (list, p: { id: string; done: boolean }) =>
    list.map((c) => (c.id === p.id ? { ...c, done: p.done } : c)),
  );
  const doneItems = checklist.filter((c) => c.done).length;

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onClose={close}
      onClick={(e) => e.target === ref.current && close()}
      aria-labelledby="task-title"
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh outline-none max-h-none w-full max-w-5xl border-l border-line bg-bg p-0 text-ink shadow-lift backdrop:bg-black/40"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
          <span className="text-sm font-semibold text-ink-2 tabular-nums">{t.key}</span>
          <span className="text-sm text-ink-3">{detail.project.name}</span>
          <div className="ml-auto flex items-center gap-1">
            {perms.create && (
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={async () => {
                  const r = await run(() => copyTaskAction({ taskId: t.id }));
                  if (r?.ok) {
                    toast(fmt(m.task.copied, { key: r.data.key }));
                    router.push(`${path}?task=${r.data.key}`, { scroll: false });
                  }
                }}
              >
                <Copy size={15} aria-hidden /> <span className="max-sm:sr-only">{m.task.copy}</span>
              </button>
            )}
            {perms.delete && (
              <button
                className="btn btn-ghost btn-sm text-danger"
                disabled={pending}
                onClick={async () => {
                  if (!confirm(fmt(m.task.confirmDelete, { key: t.key }))) return;
                  const r = await run(() => deleteTaskAction({ taskId: t.id }), fmt(m.task.deleted, { key: t.key }));
                  if (r?.ok) close();
                }}
              >
                <Trash2 size={15} aria-hidden /> <span className="max-sm:sr-only">{m.common.delete}</span>
              </button>
            )}
            <CloseButton onClick={close} label={m.task.close} />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-4 sm:px-6 sm:pt-6">
              {editable ? (
                <>
                  <label htmlFor="task-title" className="sr-only">
                    {m.task.title}
                  </label>
                  <textarea
                    id="task-title"
                    key={t.title}
                    defaultValue={t.title}
                    rows={1}
                    maxLength={200}
                    className="-mx-2 field-sizing-content w-[calc(100%+1rem)] resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-xl font-semibold hover:border-line focus-visible:border-brand focus-visible:bg-surface"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== t.title) save({ title: v });
                      else e.target.value = t.title;
                    }}
                  />
                </>
              ) : (
                <h2 id="task-title" className="text-xl font-semibold">
                  {t.title}
                </h2>
              )}
              {!editable && <p className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-2">{m.task.readOnly}</p>}
          </div>
          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-6">

              <Description text={t.description} editable={editable} people={people} onSave={(description) => save({ description })} pending={pending} />

              <section aria-labelledby="checklist-h">
                <h3 id="checklist-h" className="mb-2 flex items-center gap-2 section-title">
                  {m.task.checklist}
                  {checklist.length > 0 && <span className="text-xs font-medium text-ink-3">{fmt(m.task.checklistProgress, { done: doneItems, total: checklist.length })}</span>}
                </h3>
                {checklist.length > 0 && (
                  <div className="mb-2 h-1.5 rounded-full bg-surface-2" aria-hidden>
                    <div className="h-1.5 rounded-full bg-ok/70" style={{ width: `${(doneItems / checklist.length) * 100}%` }} />
                  </div>
                )}
                <ul className="space-y-0.5">
                  {checklist.map((c) => (
                    <li key={c.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2">
                      <input
                        type="checkbox"
                        id={`ci-${c.id}`}
                        checked={c.done}
                        disabled={!editable}
                        onChange={(e) => {
                          const done = e.target.checked;
                          run(() => (tick({ id: c.id, done }), toggleChecklistItemAction({ itemId: c.id, done })));
                        }}
                        className="size-4 accent-[var(--brand)]"
                      />
                      <label htmlFor={`ci-${c.id}`} className={`flex-1 text-sm ${c.done ? "text-ink-3 line-through" : ""}`}>
                        {c.text}
                      </label>
                      {editable && (
                        <button
                          className="rounded p-1 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
                          aria-label={`${m.task.deleteItem}: ${c.text}`}
                          onClick={() => run(() => deleteChecklistItemAction({ itemId: c.id }))}
                        >
                          <X size={14} aria-hidden />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {editable && (
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const text = String(new FormData(form).get("text") ?? "").trim();
                      if (!text) return;
                      const r = await run(() => addChecklistItemAction({ taskId: t.id, text }));
                      if (r?.ok) form.reset();
                    }}
                  >
                    <label htmlFor="new-item" className="sr-only">
                      {m.task.itemPlaceholder}
                    </label>
                    <input id="new-item" name="text" className="input min-h-8 py-1" placeholder={m.task.itemPlaceholder} maxLength={300} />
                    <button className="btn btn-sm shrink-0" disabled={pending}>
                      {m.task.addItem}
                    </button>
                  </form>
                )}
              </section>

              <section aria-labelledby="comments-h">
                <h3 id="comments-h" className="mb-3 section-title">
                  {m.task.comments}
                </h3>
                <ol className="space-y-4">
                  {detail.comments.map((c) => {
                    const author = person(c.authorId);
                    return (
                      <li key={c.id} className="flex gap-3">
                        <Avatar id={c.authorId} name={author?.name ?? "?"} size={30} title="" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <span className="font-semibold">{author?.name ?? m.common.unknownUser}</span>{" "}
                            <time className="text-xs text-ink-3" dateTime={new Date(c.createdAt).toISOString()} title={i.dateTime(c.createdAt)}>
                              {i.ago(c.createdAt)}
                            </time>
                          </p>
                          <div className="mt-1 rounded-md border border-line bg-surface px-3 py-2">
                            <Markdown text={c.body} people={people} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {!detail.comments.length && <li className="text-sm text-ink-3">{m.task.noComments}</li>}
                </ol>
                {perms.comment && <CommentBox taskId={t.id} people={people.filter((p) => detail.assignable.includes(p.id))} />}
              </section>

              <section aria-labelledby="history-h">
                <h3 id="history-h" className="mb-2 section-title">
                  {m.task.activity}
                </h3>
                <ol className="space-y-2 border-l border-line pl-4">
                  {detail.activity.map((a) => (
                    <li key={a.id} className="text-sm">
                      <span className="font-medium">{person(a.actorId)?.name ?? m.common.unknownUser}</span>{" "}
                      <span className="text-ink-2">{activityText(a, i, people, detail.columns, detail.sprints)}</span>{" "}
                      <time className="text-xs text-ink-3" dateTime={new Date(a.createdAt).toISOString()} title={i.dateTime(a.createdAt)}>
                        {i.ago(a.createdAt)}
                      </time>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <aside className="order-first h-fit space-y-1 rounded-lg border border-line bg-surface p-4 lg:sticky lg:top-0 lg:order-none">
              <SideField label={m.task.status} htmlFor="f-status">
                <select
                  id="f-status"
                  className="input min-h-8 py-1"
                  value={t.columnId}
                  disabled={!editable || pending}
                  onChange={async (e) => {
                    const target = e.target.value;
                    const r = await run(() => moveTaskAction({ taskId: t.id, version, columnId: target, index: 0 }));
                    if (r?.ok) {
                      setLocalVersion(r.data.version);
                      const c = detail.columns.find((x) => x.id === target);
                      if (c) toast(fmt(m.board.moved, { key: t.key, column: i.columnName(c) }));
                    }
                  }}
                >
                  {detail.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {i.columnName(c)}
                    </option>
                  ))}
                </select>
                <span className="sr-only">{column ? i.columnName(column) : ""}</span>
              </SideField>
              {(detail.sprints.length > 0 || t.sprintId) && (
                <SideField label={m.sprint.label} htmlFor="f-sprint-task">
                  <select
                    id="f-sprint-task"
                    className="input min-h-8 py-1"
                    value={t.sprintId ?? ""}
                    disabled={!editable || pending}
                    onChange={(e) => save({ sprintId: e.target.value || null })}
                  >
                    <SprintOptions sprints={detail.sprints} current={t.sprintId} />
                  </select>
                </SideField>
              )}

              <div className="py-1.5">
                <span className="text-[13px] text-ink-2">{m.task.assignees}</span>
                <ul className="mt-1.5 space-y-1">
                  {t.assigneeIds.map((id) => {
                    const p = person(id);
                    const canRemove = id === me ? perms.assignSelf : perms.assignOthers;
                    return (
                      <li key={id} className="flex items-center gap-2 text-sm">
                        <Avatar id={id} name={p?.name ?? "?"} size={24} title="" />
                        <Link href={`/team/${id}`} className="min-w-0 flex-1 truncate hover:underline">
                          {p?.name ?? m.common.unknownUser}
                          {p && !p.active && <span className="text-ink-3"> ({m.common.deactivated})</span>}
                        </Link>
                        {canRemove && (
                          <button
                            className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-danger"
                            aria-label={fmt(m.task.removeAssignee, { name: p?.name ?? "" })}
                            disabled={pending}
                            onClick={() => run(() => unassignTaskAction({ taskId: t.id, userId: id }))}
                          >
                            <X size={14} aria-hidden />
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {!t.assigneeIds.length && <li className="text-sm text-ink-3">{m.task.nobody}</li>}
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  {perms.assignSelf && !t.assigneeIds.includes(me) && detail.assignable.includes(me) && (
                    <button className="btn btn-sm" disabled={pending} onClick={() => run(() => assignTaskAction({ taskId: t.id, userId: me }))}>
                      <UserPlus size={14} aria-hidden /> {m.task.assignToMe}
                    </button>
                  )}
                  {perms.assignOthers && assignable.filter((p) => p.id !== me).length > 0 && (
                    <>
                      <label htmlFor="f-assign" className="sr-only">
                        {m.task.addAssignee}
                      </label>
                      <select
                        id="f-assign"
                        className="input min-h-8 w-full py-1"
                        value=""
                        disabled={pending}
                        onChange={(e) => e.target.value && run(() => assignTaskAction({ taskId: t.id, userId: e.target.value }))}
                      >
                        <option value="">{m.task.addAssignee}…</option>
                        {assignable
                          .filter((p) => p.id !== me)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </>
                  )}
                </div>
              </div>

              <SideField label={m.priority.label} htmlFor="f-pri">
                <div className="flex items-center gap-1.5">
                  <PriorityIcon priority={t.priority} label="" />
                  <select id="f-pri" className="input min-h-8 py-1" value={t.priority} disabled={!editable || pending} onChange={(e) => save({ priority: e.target.value })}>
                    {(["highest", "high", "medium", "low", "lowest"] as const).map((p) => (
                      <option key={p} value={p}>
                        {m.priority[p]}
                      </option>
                    ))}
                  </select>
                </div>
              </SideField>
              <SideField label={m.task.dueDate} htmlFor="f-due">
                <input
                  id="f-due"
                  key={t.dueDate ?? ""}
                  type="date"
                  lang={i.tag}
                  className="input min-h-8 py-1"
                  defaultValue={t.dueDate ?? ""}
                  disabled={!editable}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    if (v !== t.dueDate && (v === null || /^\d{4}-\d{2}-\d{2}$/.test(v))) save({ dueDate: v });
                  }}
                />
              </SideField>
              <SideField label={m.task.estimate} htmlFor="f-est">
                <input
                  id="f-est"
                  key={String(t.estimate)}
                  type="number"
                  min={0}
                  max={1000}
                  step="0.5"
                  className="input min-h-8 py-1"
                  defaultValue={t.estimate ?? ""}
                  disabled={!editable}
                  onBlur={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    if (v !== t.estimate) save({ estimate: v });
                  }}
                />
              </SideField>
              <SideField label={m.task.labels} htmlFor="f-labels">
                {editable ? (
                  <input
                    id="f-labels"
                    key={t.labels.join(",")}
                    className="input min-h-8 py-1"
                    defaultValue={t.labels.join(", ")}
                    placeholder={m.task.labelsHint}
                    onBlur={(e) => {
                      const labels = e.target.value
                        .split(",")
                        .map((l) => l.trim())
                        .filter(Boolean);
                      if (labels.join(",") !== t.labels.join(",")) save({ labels });
                    }}
                  />
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {t.labels.length ? t.labels.map((l) => <span key={l} className="tag bg-brand-soft">{l}</span>) : <span className="text-sm text-ink-3">{m.task.noLabels}</span>}
                  </span>
                )}
              </SideField>
              <SideField label={m.task.reporter}>
                <span className="flex items-center gap-2 text-sm">
                  <Avatar id={t.reporterId} name={person(t.reporterId)?.name ?? "?"} size={22} title="" />
                  <span className="truncate">{person(t.reporterId)?.name ?? m.common.unknownUser}</span>
                </span>
              </SideField>
              <p className="pt-2 text-xs text-ink-3">{fmt(m.task.createdAt, { date: i.dateTime(t.createdAt) })}</p>
            </aside>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function Description({ text, editable, people, onSave, pending }: { text: string; editable: boolean; people: Person[]; onSave: (v: string) => Promise<boolean>; pending: boolean }) {
  const { m } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [preview, setPreview] = useState(false);
  return (
    <section aria-labelledby="desc-h">
      <div className="mb-2 flex items-center gap-2">
        <h3 id="desc-h" className="section-title">
          {m.task.description}
        </h3>
        {editable && !editing && (
          <button
            className="btn btn-ghost btn-sm ml-auto"
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
          >
            {m.common.edit}
          </button>
        )}
      </div>
      {editing ? (
        <div>
          <div className="mb-2 flex gap-1">
            <button type="button" className="chip" aria-pressed={!preview} onClick={() => setPreview(false)}>
              {m.task.write}
            </button>
            <button type="button" className="chip" aria-pressed={preview} onClick={() => setPreview(true)}>
              {m.task.preview}
            </button>
          </div>
          {preview ? (
            <div className="min-h-32 rounded-md border border-line bg-surface p-3">
              <Markdown text={draft || m.task.noDescription} people={people} />
            </div>
          ) : (
            <>
              <label htmlFor="desc-edit" className="sr-only">
                {m.task.description}
              </label>
              <textarea
                id="desc-edit"
                autoFocus
                rows={8}
                maxLength={20000}
                className="input font-[inherit] leading-relaxed"
                value={draft}
                placeholder={m.task.descriptionPlaceholder}
                onChange={(e) => setDraft(e.target.value)}
              />
            </>
          )}
          <div className="mt-2 flex gap-2">
            <button
              className="btn btn-primary btn-sm"
              disabled={pending}
              // The editor stays open until the save lands, so a refused save (conflict) keeps the draft.
              onClick={async () => {
                if (draft === text || (await onSave(draft))) setEditing(false);
              }}
            >
              {m.common.save}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setEditing(false)}
            >
              {m.common.cancel}
            </button>
          </div>
        </div>
      ) : text ? (
        <Markdown text={text} people={people} />
      ) : (
        <p className="text-sm text-ink-3">{m.task.noDescription}</p>
      )}
    </section>
  );
}

/** Comment input with @mention suggestions (arrow keys + Enter to pick, Ctrl/Cmd+Enter to send). */
function CommentBox({ taskId, people }: { taskId: string; people: Person[] }) {
  const { m } = useI18n();
  const { run, pending } = useRun();
  const [body, setBody] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const matches = query === null ? [] : people.filter((p) => fold(p.name).includes(fold(query)) || handleOf(p.email).startsWith(query.toLowerCase())).slice(0, 6);

  const updateQuery = (value: string, caret: number) => {
    const mm = /(?:^|\s)@([\w.-]*)$/.exec(value.slice(0, caret));
    setQuery(mm ? mm[1] : null);
    setSel(0);
  };
  const pick = (p: Person) => {
    const el = area.current!;
    const caret = el.selectionStart;
    const before = body.slice(0, caret).replace(/@([\w.-]*)$/, `@${handleOf(p.email)} `);
    const next = before + body.slice(caret);
    setBody(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  };
  const submit = async () => {
    if (!body.trim()) return;
    const r = await run(() => addCommentAction({ taskId, body }));
    if (r?.ok) setBody("");
  };

  return (
    <form
      className="relative mt-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="comment" className="sr-only">
        {m.task.writeComment}
      </label>
      <textarea
        id="comment"
        ref={area}
        rows={3}
        maxLength={10000}
        className="input"
        placeholder={m.task.writeComment}
        value={body}
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls="mention-list"
        aria-autocomplete="list"
        aria-activedescendant={matches.length ? `mention-${matches[sel]?.id}` : undefined}
        onChange={(e) => {
          setBody(e.target.value);
          updateQuery(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => (s + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(matches[sel]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setQuery(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {matches.length > 0 && (
        <ul id="mention-list" role="listbox" className="absolute z-10 mt-1 w-64 overflow-hidden rounded-md border border-line bg-surface shadow-lift">
          {matches.map((p, idx) => (
            <li
              key={p.id}
              id={`mention-${p.id}`}
              role="option"
              aria-selected={idx === sel}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm aria-selected:bg-brand-soft"
            >
              <Avatar id={p.id} name={p.name} size={22} title="" />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto text-xs text-ink-3">@{handleOf(p.email)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex justify-end">
        <button className="btn btn-primary btn-sm" disabled={pending || !body.trim()}>
          {m.task.sendComment}
        </button>
      </div>
    </form>
  );
}
