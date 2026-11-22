"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { acceptInviteAction, changePasswordAction, loginAction, setLocaleAction, signupAction } from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";
import { LOCALES } from "@/lib/i18n";
import { FormError } from "./client";

function useAuthSubmit(action: (input: Record<string, string>) => Promise<{ ok: boolean; error?: string }>, to = "/my-work") {
  const { m } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    start(async () => {
      const r = await action(input).catch(() => ({ ok: false, error: "generic" }));
      if (r.ok) router.replace(to);
      else setError(m.errors[(r.error ?? "generic") as keyof typeof m.errors] as string);
    });
  };
  return { onSubmit, error, pending };
}

function Field({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${props.name}`;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input id={id} className="input min-h-10" required aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-3">
          {hint}
        </p>
      )}
    </div>
  );
}

export function LanguageSwitch() {
  const { locale, m } = useI18n();
  const [pending, start] = useTransition();
  return (
    <div className="flex rounded-md border border-line bg-surface p-0.5 text-[13px]" role="group" aria-label={m.common.language}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          disabled={pending}
          aria-pressed={l === locale}
          onClick={() => start(() => setLocaleAction(l))}
          className="rounded px-2.5 py-1 font-medium text-ink-2 aria-pressed:bg-brand-soft aria-pressed:text-ink"
        >
          {m.common.languages[l]}
        </button>
      ))}
    </div>
  );
}

export function LoginForm() {
  const { m } = useI18n();
  const f = useAuthSubmit(loginAction);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{m.auth.loginTitle}</h1>
      <p className="mt-1 mb-6 text-sm text-ink-2">{m.auth.loginLead}</p>
      <form method="post" onSubmit={f.onSubmit} className="space-y-4">
        <FormError error={f.error} />
        <Field label={m.auth.email} name="email" type="email" autoComplete="username" autoFocus />
        <Field label={m.auth.password} name="password" type="password" autoComplete="current-password" />
        <button className="btn btn-primary min-h-10 w-full" disabled={f.pending}>
          {m.auth.signIn}
        </button>
      </form>
      <p className="mt-8 text-sm text-ink-2">
        {m.auth.noAccount}{" "}
        <Link href="/signup" className="font-medium text-brand underline underline-offset-2">
          {m.auth.createCompany}
        </Link>
      </p>
    </>
  );
}

export function SignupForm() {
  const { m, locale } = useI18n();
  const f = useAuthSubmit((input) => signupAction({ ...input, locale }));
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{m.auth.signupTitle}</h1>
      <p className="mt-1 mb-6 text-sm text-ink-2">{m.auth.signupLead}</p>
      <form method="post" onSubmit={f.onSubmit} className="space-y-4">
        <FormError error={f.error} />
        <Field label={m.auth.company} name="company" autoComplete="organization" minLength={2} maxLength={100} autoFocus />
        <Field label={m.auth.yourName} name="name" autoComplete="name" maxLength={100} />
        <Field label={m.auth.email} name="email" type="email" autoComplete="email" />
        <Field label={m.auth.password} name="password" type="password" autoComplete="new-password" minLength={10} hint={m.auth.passwordHint} />
        <button className="btn btn-primary min-h-10 w-full" disabled={f.pending}>
          {m.auth.createWorkspace}
        </button>
      </form>
      <p className="mt-8 text-sm text-ink-2">
        {m.auth.haveAccount}{" "}
        <Link href="/login" className="font-medium text-brand underline underline-offset-2">
          {m.auth.signIn}
        </Link>
      </p>
    </>
  );
}

export function InviteForm({ token, email, userLocale }: { token: string; email: string; userLocale: string }) {
  const { m, locale } = useI18n();
  const f = useAuthSubmit((input) => acceptInviteAction({ ...input, token }));
  // Open the invite in the language the admin chose for this person, unless this browser already picked one.
  useEffect(() => {
    if (userLocale !== locale && !document.cookie.includes("pano_locale=")) void setLocaleAction(userLocale);
  }, [userLocale, locale]);
  return (
    <form method="post" onSubmit={f.onSubmit} className="space-y-4">
      <FormError error={f.error} />
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <Field label={m.auth.newPassword} name="password" type="password" autoComplete="new-password" minLength={10} hint={m.auth.passwordHint} autoFocus />
      <button className="btn btn-primary min-h-10 w-full" disabled={f.pending}>
        {m.auth.setPassword}
      </button>
    </form>
  );
}

export function ChangePasswordForm({ to = "/my-work", compact }: { to?: string; compact?: boolean }) {
  const { m } = useI18n();
  const f = useAuthSubmit(changePasswordAction, to);
  return (
    <form method="post" onSubmit={f.onSubmit} className={compact ? "max-w-sm space-y-3" : "space-y-4"}>
      <FormError error={f.error} />
      <Field label={m.auth.currentPassword} name="current" type="password" autoComplete="current-password" />
      <Field label={m.auth.newPassword} name="password" type="password" autoComplete="new-password" minLength={10} hint={m.auth.passwordHint} />
      <button className={`btn btn-primary ${compact ? "" : "min-h-10 w-full"}`} disabled={f.pending}>
        {m.auth.changePassword}
      </button>
    </form>
  );
}
