import { ChangePasswordForm } from "@/components/auth-forms";
import { ProfileForm } from "@/components/forms";
import { PageHeader } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/session";
import { handleOf } from "@/lib/links";

export async function generateMetadata() {
  return { title: (await getI18n()).m.settings.title };
}

export default async function SettingsPage() {
  const ctx = await requireCtx();
  const i = await getI18n();
  const { m } = i;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={m.settings.title} />
      <section className="card p-5" aria-labelledby="profile">
        <h2 id="profile" className="mb-4 section-title">
          {m.settings.profile}
        </h2>
        <ProfileForm name={ctx.name} locale={ctx.locale} theme={ctx.theme} />
      </section>
      <section className="card p-5" aria-labelledby="account">
        <h2 id="account" className="mb-3 section-title">
          {m.settings.account}
        </h2>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-ink-2">{m.auth.email}</dt>
          <dd>{ctx.email}</dd>
          <dt className="text-ink-2">{m.settings.workspace}</dt>
          <dd>{ctx.workspaceName}</dd>
          <dt className="text-ink-2">{m.settings.role}</dt>
          <dd>{i.roleName({ name: ctx.roleName, builtin: ctx.roleBuiltin })}</dd>
          <dt className="text-ink-2">{m.settings.handle}</dt>
          <dd className="font-medium">@{handleOf(ctx.email)}</dd>
        </dl>
      </section>
      <section className="card p-5" aria-labelledby="password">
        <h2 id="password" className="section-title">
          {m.settings.password}
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-2">{m.settings.passwordLead}</p>
        <ChangePasswordForm to="/settings" compact />
      </section>
    </div>
  );
}
