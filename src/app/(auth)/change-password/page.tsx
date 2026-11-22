import { ChangePasswordForm } from "@/components/auth-forms";
import { getI18n } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/session";

export default async function ChangePasswordPage() {
  await requireCtx();
  const { m } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{m.auth.changeTitle}</h1>
      <p className="mt-1 mb-6 text-sm text-ink-2">{m.auth.changeLead}</p>
      <ChangePasswordForm />
    </>
  );
}
