"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import {
  addColumnAction,
  createProjectAction,
  deleteColumnAction,
  markNotificationsReadAction,
  moveColumnAction,
  updateColumnAction,
  updateProfileAction,
  updateProjectAction,
} from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";
import { Dialog, useRun } from "./client";

export function MarkAllRead() {
  const { m } = useI18n();
  const { run, pending } = useRun();
  return (
    <button className="btn" disabled={pending} onClick={() => run(() => markNotificationsReadAction({}))}>
      {m.notifications.markAllRead}
    </button>
  );
}

export function ProfileForm({ name, locale, theme }: { name: string; locale: string; theme: string }) {
  const { m } = useI18n();
  const { run, pending } = useRun();
  const router = useRouter();
  return (
    <form
      className="grid max-w-xl gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        const r = await run(() => updateProfileAction(f), m.common.saved);
        // Theme lives on <html>, which only a full render updates.
        if (r?.ok) router.refresh();
      }}
    >
      <div className="sm:col-span-2">
        <label className="label" htmlFor="p-name">
          {m.settings.name}
        </label>
        <input id="p-name" name="name" className="input" defaultValue={name} required maxLength={100} autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="p-locale">
          {m.settings.language}
        </label>
        <select id="p-locale" name="locale" className="input" defaultValue={locale}>
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="p-theme">
          {m.settings.theme}
        </label>
        <select id="p-theme" name="theme" className="input" defaultValue={theme}>
          {(["system", "light", "dark"] as const).map((t) => (
            <option key={t} value={t}>
              {m.settings.themes[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>
          {m.common.save}
        </button>
      </div>
    </form>
  );
}

type Person = { id: string; name: string };

function ProjectFields({
  people,
  initial,
  withKey,
}: {
  people: Person[];
  initial?: { name: string; description: string; restricted: boolean; memberIds: string[] };
  withKey?: boolean;
}) {
  const { m } = useI18n();
  const [restricted, setRestricted] = useState(initial?.restricted ?? false);
  return (
    <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
      {withKey && (
        <div>
          <label className="label" htmlFor="pr-key">
            {m.projects.key}
          </label>
          <input
            id="pr-key"
            name="key"
            className="input uppercase"
            required
            pattern="[A-Za-z][A-Za-z0-9]{1,5}"
            maxLength={6}
            aria-describedby="pr-key-hint"
            autoComplete="off"
          />
        </div>
      )}
      <div className={withKey ? "" : "sm:col-span-2"}>
        <label className="label" htmlFor="pr-name">
          {m.projects.name}
        </label>
        <input id="pr-name" name="name" className="input" required minLength={2} maxLength={80} defaultValue={initial?.name} />
      </div>
      {withKey && (
        <p id="pr-key-hint" className="-mt-2 text-xs text-ink-3 sm:col-span-2">
          {m.projects.keyHint}
        </p>
      )}
      <div className="sm:col-span-2">
        <label className="label" htmlFor="pr-desc">
          {m.projects.description} <span className="font-normal text-ink-3">({m.common.optional})</span>
        </label>
        <textarea id="pr-desc" name="description" rows={2} className="input" maxLength={2000} defaultValue={initial?.description} />
      </div>
      <div className="sm:col-span-2">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="restricted" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>
            {m.projects.restricted}
            <span className="block text-xs text-ink-3">{m.projects.restrictedHint}</span>
          </span>
        </label>
        {restricted && (
          <fieldset className="mt-3 rounded-md border border-line p-3">
            <legend className="px-1 text-[13px] font-medium text-ink-2">{m.projects.members}</legend>
            <div className="grid max-h-48 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {people.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="memberIds" value={p.id} defaultChecked={initial?.memberIds.includes(p.id)} className="size-4 accent-[var(--brand)]" />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </div>
  );
}

function readProject(form: HTMLFormElement) {
  const fd = new FormData(form);
  return {
    key: String(fd.get("key") ?? ""),
    name: String(fd.get("name")),
    description: String(fd.get("description") ?? ""),
    restricted: fd.get("restricted") === "on",
    memberIds: fd.getAll("memberIds").map(String),
  };
}

export function NewProjectButton({ people }: { people: Person[] }) {
  const { m } = useI18n();
  const [open, setOpen] = useState(false);
  const { run, pending } = useRun();
  const router = useRouter();
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden /> {m.projects.newProject}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={m.projects.newProject} wide>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => createProjectAction(readProject(e.currentTarget)), m.projects.created);
            if (r?.ok) {
              setOpen(false);
              router.push(`/projects/${r.data.key}`);
            }
          }}
        >
          <ProjectFields people={people} withKey />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              {m.common.cancel}
            </button>
            <button className="btn btn-primary" disabled={pending}>
              {m.common.create}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function ProjectDetailsForm({
  projectId,
  people,
  initial,
}: {
  projectId: string;
  people: Person[];
  initial: { name: string; description: string; restricted: boolean; memberIds: string[] };
}) {
  const { m } = useI18n();
  const { run, pending } = useRun();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const { key: _k, ...data } = readProject(e.currentTarget);
        run(() => updateProjectAction({ projectId, ...data }), m.common.saved);
      }}
    >
      <ProjectFields people={people} initial={initial} />
      <button className="btn btn-primary mt-4" disabled={pending}>
        {m.common.save}
      </button>
    </form>
  );
}

type Column = { id: string; name: string; defaultName: string | null; category: string; wipLimit: number | null };

export function ColumnsEditor({ projectId, columns }: { projectId: string; columns: Column[] }) {
  const { m, fmt } = useI18n();
  const { run, pending } = useRun();
  const save = (c: Column, form: HTMLFormElement) => {
    const fd = new FormData(form);
    const wip = String(fd.get("wipLimit") ?? "");
    run(
      () =>
        updateColumnAction({
          columnId: c.id,
          name: String(fd.get("name")).trim() === c.defaultName ? null : String(fd.get("name")),
          category: String(fd.get("category")),
          wipLimit: wip ? Number(wip) : null,
        }),
      m.common.saved,
    );
  };
  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {columns.map((c, idx) => (
          <li key={c.id + c.name + c.category + c.wipLimit}>
            <form
              className="grid grid-cols-2 items-end gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_9rem_7rem_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                save(c, e.currentTarget);
              }}
            >
              <div className="col-span-2 sm:col-span-1">
                <label className="label" htmlFor={`cn-${c.id}`}>
                  {m.projects.columnName}
                </label>
                <input id={`cn-${c.id}`} name="name" className="input" defaultValue={c.name} required maxLength={40} />
              </div>
              <div>
                <label className="label" htmlFor={`cc-${c.id}`}>
                  {m.projects.category}
                </label>
                <select id={`cc-${c.id}`} name="category" className="input" defaultValue={c.category}>
                  {(["todo", "doing", "done"] as const).map((k) => (
                    <option key={k} value={k}>
                      {m.columns.categories[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`cw-${c.id}`}>
                  {m.projects.wipLimit}
                </label>
                <input id={`cw-${c.id}`} name="wipLimit" type="number" min={1} max={999} className="input" defaultValue={c.wipLimit ?? ""} placeholder={m.projects.wipNone} />
              </div>
              <div className="col-span-2 flex gap-1 sm:col-span-1">
                <button className="btn btn-primary btn-sm" disabled={pending}>
                  {m.common.save}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm px-1.5"
                  disabled={pending || idx === 0}
                  aria-label={fmt(m.projects.moveLeft, { name: c.name })}
                  title={fmt(m.projects.moveLeft, { name: c.name })}
                  onClick={() => run(() => moveColumnAction({ columnId: c.id, dir: -1 }))}
                >
                  <ArrowLeft size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm px-1.5"
                  disabled={pending || idx === columns.length - 1}
                  aria-label={fmt(m.projects.moveRight, { name: c.name })}
                  title={fmt(m.projects.moveRight, { name: c.name })}
                  onClick={() => run(() => moveColumnAction({ columnId: c.id, dir: 1 }))}
                >
                  <ArrowRight size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm px-1.5 text-danger"
                  disabled={pending}
                  aria-label={fmt(m.projects.deleteColumn, { name: c.name })}
                  title={fmt(m.projects.deleteColumn, { name: c.name })}
                  onClick={() => run(() => deleteColumnAction({ columnId: c.id }))}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            </form>
          </li>
        ))}
      </ol>
      <form
        className="flex flex-wrap items-end gap-2 pt-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const r = await run(() => addColumnAction({ projectId, name: String(fd.get("name")), category: String(fd.get("category")), wipLimit: null }));
          if (r?.ok) form.reset();
        }}
      >
        <div className="min-w-40 flex-1">
          <label className="label" htmlFor="new-col">
            {m.projects.columnName}
          </label>
          <input id="new-col" name="name" className="input" required maxLength={40} />
        </div>
        <div>
          <label className="label" htmlFor="new-col-cat">
            {m.projects.category}
          </label>
          <select id="new-col-cat" name="category" className="input" defaultValue="doing">
            {(["todo", "doing", "done"] as const).map((k) => (
              <option key={k} value={k}>
                {m.columns.categories[k]}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" disabled={pending}>
          <Plus size={16} aria-hidden /> {m.projects.addColumn}
        </button>
      </form>
    </div>
  );
}
