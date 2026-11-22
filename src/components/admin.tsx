"use client";
import { useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import {
  createRoleAction,
  createUserAction,
  deleteRoleAction,
  resetPasswordAction,
  updateRoleAction,
  updateUserAction,
} from "@/app/actions";
import { PERMISSIONS } from "@/lib/perms";
import { useI18n } from "@/lib/i18n/client";
import { CopyField, Dialog, useRun } from "./client";
import { Avatar } from "./ui";

type Role = { id: string; name: string; builtin: string | null; permissions: string[]; users: number };
type User = { id: string; name: string; email: string; active: boolean; roleId: string; pending: boolean };

function CredentialFields({ idPrefix }: { idPrefix: string }) {
  const { m } = useI18n();
  const [mode, setMode] = useState<"invite" | "password">("invite");
  return (
    <fieldset>
      <legend className="label">{m.admin.access}</legend>
      <div className="space-y-2">
        {(["invite", "password"] as const).map((k) => (
          <label key={k} className="flex items-start gap-2 rounded-md border border-line p-2.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="radio" name="mode" value={k} checked={mode === k} onChange={() => setMode(k)} className="mt-0.5 accent-[var(--brand)]" />
            <span>
              <span className="font-medium">{k === "invite" ? m.admin.inviteLink : m.admin.tempPassword}</span>
              <span className="block text-xs text-ink-2">{k === "invite" ? m.admin.inviteLinkHint : m.admin.tempPasswordHint}</span>
            </span>
          </label>
        ))}
      </div>
      {mode === "password" && (
        <div className="mt-3">
          <label className="label" htmlFor={`${idPrefix}-pw`}>
            {m.auth.password}
          </label>
          <input id={`${idPrefix}-pw`} name="password" type="text" className="input" required minLength={10} autoComplete="off" aria-describedby={`${idPrefix}-pw-hint`} />
          <p id={`${idPrefix}-pw-hint`} className="mt-1 text-xs text-ink-3">
            {m.auth.passwordHint}
          </p>
        </div>
      )}
    </fieldset>
  );
}

function LinkDialog({ link, onClose }: { link: { title: string; url: string } | null; onClose: () => void }) {
  const { m } = useI18n();
  return (
    <Dialog open={!!link} onClose={onClose} title={link?.title ?? ""}>
      <p className="mb-3 text-sm text-ink-2">{m.admin.linkReadyLead}</p>
      {link && <CopyField value={link.url} />}
    </Dialog>
  );
}

export function UsersAdmin({ users, roles, meId, assignable }: { users: User[]; roles: Role[]; meId: string; assignable: string[] }) {
  const i = useI18n();
  const { m, fmt } = i;
  const { run, pending } = useRun();
  const [adding, setAdding] = useState(false);
  const [reset, setReset] = useState<User | null>(null);
  const [link, setLink] = useState<{ title: string; url: string } | null>(null);
  const roleOptions = roles.filter((r) => assignable.includes(r.id));
  const roleLabel = (r: Role) => i.roleName(r);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} aria-hidden /> {m.admin.newUser}
        </button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-line bg-surface-2 text-left text-xs text-ink-2">
            <tr>
              <th className="px-4 py-2 font-medium">{m.admin.name}</th>
              <th className="px-4 py-2 font-medium">{m.admin.role}</th>
              <th className="px-4 py-2 font-medium">{m.admin.status}</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => {
              const me = u.id === meId;
              const manageable = assignable.includes(u.roleId);
              return (
                <tr key={u.id} className={u.active ? "" : "text-ink-3"}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar id={u.id} name={u.name} size={30} title="" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {u.name} {me && <span className="font-normal text-ink-3">({m.admin.you})</span>}
                        </p>
                        <p className="truncate text-xs text-ink-3">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {manageable ? (
                      <select
                        className="input min-h-8 w-auto py-1"
                        aria-label={fmt(m.admin.changeRole, { name: u.name })}
                        value={u.roleId}
                        disabled={pending}
                        onChange={(e) => run(() => updateUserAction({ userId: u.id, roleId: e.target.value }), m.admin.roleChanged)}
                      >
                        {roleOptions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      roleLabel(roles.find((r) => r.id === u.roleId)!)
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`tag ${!u.active ? "bg-surface-2 text-ink-2" : u.pending ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>
                      {!u.active ? m.admin.inactive : u.pending ? m.admin.pending : m.admin.active}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {manageable && (
                      <>
                        <button className="btn btn-ghost btn-sm" disabled={pending || !u.active} onClick={() => setReset(u)}>
                          {m.admin.resetPassword}
                        </button>
                        {!me && (
                          <button
                            className={`btn btn-ghost btn-sm ${u.active ? "text-danger" : ""}`}
                            disabled={pending}
                            onClick={() => {
                              if (u.active && !confirm(fmt(m.admin.confirmDeactivate, { name: u.name }))) return;
                              run(() => updateUserAction({ userId: u.id, active: !u.active }), m.common.saved);
                            }}
                          >
                            {u.active ? m.admin.deactivate : m.admin.activate}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title={m.admin.newUser}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
            const r = await run(() => createUserAction(f), fmt(m.admin.userCreated, { name: f.name }));
            if (!r?.ok) return;
            setAdding(false);
            if (r.data.inviteUrl && !r.data.emailed) setLink({ title: fmt(m.admin.linkReady, { name: f.name }), url: r.data.inviteUrl });
          }}
        >
          <div>
            <label className="label" htmlFor="u-name">
              {m.admin.name}
            </label>
            <input id="u-name" name="name" className="input" required maxLength={100} autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="u-email">
              {m.admin.email}
            </label>
            <input id="u-email" name="email" type="email" className="input" required autoComplete="off" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="u-role">
                {m.admin.role}
              </label>
              <select id="u-role" name="roleId" className="input" defaultValue={roleOptions.find((r) => r.builtin === "member")?.id}>
                {roleOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="u-locale">
                {m.common.language}
              </label>
              <select id="u-locale" name="locale" className="input" defaultValue={i.locale}>
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <CredentialFields idPrefix="new" />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              {m.common.cancel}
            </button>
            <button className="btn btn-primary" disabled={pending}>
              {m.admin.createUser}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!reset} onClose={() => setReset(null)} title={reset ? fmt(m.admin.resetTitle, { name: reset.name }) : ""}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
            const target = reset!;
            const r = await run(() => resetPasswordAction({ ...f, userId: target.id }), m.admin.resetDone);
            if (!r?.ok) return;
            setReset(null);
            if (r.data.inviteUrl) setLink({ title: fmt(m.admin.resetLinkReady, { name: target.name }), url: r.data.inviteUrl });
          }}
        >
          <CredentialFields idPrefix="reset" />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setReset(null)}>
              {m.common.cancel}
            </button>
            <button className="btn btn-primary" disabled={pending}>
              {m.admin.resetPassword}
            </button>
          </div>
        </form>
      </Dialog>

      <LinkDialog link={link} onClose={() => setLink(null)} />
    </>
  );
}

export function RolesAdmin({ roles, mine }: { roles: Role[]; mine: string[] }) {
  const i = useI18n();
  const { m, fmt, plural } = i;
  const { run, pending } = useRun();
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const current = editing === "new" ? null : editing;
  return (
    <>
      <div className="mb-4 flex justify-end">
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus size={16} aria-hidden /> {m.roles.newRole}
        </button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {roles.map((r) => (
          <li key={r.id} className="card flex flex-col p-4">
            <div className="flex items-start gap-2">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{i.roleName(r)}</h2>
                <p className="text-xs text-ink-3">
                  {r.builtin ? m.roles.builtinBadge : null}
                  {r.builtin ? " · " : ""}
                  {plural(m.roles.users, r.users)}
                </p>
              </div>
              {!r.builtin && (
                <button className="btn btn-sm" onClick={() => setEditing(r)}>
                  {m.common.edit}
                </button>
              )}
            </div>
            {r.builtin && <p className="mt-2 text-sm text-ink-2">{m.roles.builtinHint[r.builtin as "admin"]}</p>}
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {r.permissions.length ? (
                r.permissions.map((p) => (
                  <li key={p} className="tag bg-surface-2 text-ink-2">
                    {m.roles.perms[p as keyof typeof m.roles.perms]}
                  </li>
                ))
              ) : (
                <li className="text-xs text-ink-3">{m.roles.noPerms}</li>
              )}
            </ul>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-3">{m.roles.ownTaskNote}</p>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={current ? m.roles.editRole : m.roles.newRole}>
        <form
          key={current?.id ?? "new"}
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const data = { name: String(fd.get("name")), permissions: fd.getAll("perm").map(String) };
            const r = await run<unknown>(
              () => (current ? updateRoleAction({ roleId: current.id, ...data }) : createRoleAction(data)),
              current ? m.common.saved : m.roles.created,
            );
            if (r?.ok) setEditing(null);
          }}
        >
          <div>
            <label className="label" htmlFor="r-name">
              {m.roles.name}
            </label>
            <input id="r-name" name="name" className="input" required minLength={2} maxLength={50} defaultValue={current?.name} />
          </div>
          <fieldset>
            <legend className="label">{m.roles.permissions}</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {PERMISSIONS.map((p) => (
                <label key={p} className={`flex items-center gap-2 text-sm ${mine.includes(p) ? "" : "text-ink-3"}`}>
                  <input
                    type="checkbox"
                    name="perm"
                    value={p}
                    defaultChecked={current?.permissions.includes(p)}
                    disabled={!mine.includes(p)}
                    className="size-4 accent-[var(--brand)]"
                  />
                  {m.roles.perms[p]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap justify-between gap-2">
            {current ? (
              <button
                type="button"
                className="btn text-danger"
                disabled={pending}
                onClick={async () => {
                  if (!confirm(fmt(m.roles.confirmDelete, { name: current.name }))) return;
                  const r = await run(() => deleteRoleAction({ roleId: current.id }));
                  if (r?.ok) setEditing(null);
                }}
              >
                {m.roles.deleteRole}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                {m.common.cancel}
              </button>
              <button className="btn btn-primary" disabled={pending}>
                {m.common.save}
              </button>
            </div>
          </div>
        </form>
      </Dialog>
    </>
  );
}
