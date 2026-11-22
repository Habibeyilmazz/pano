import Link from "next/link";
import { InviteForm } from "@/components/auth-forms";
import { getI18n } from "@/lib/i18n/server";
import { inviteUser } from "@/server/account";

export const metadata = { referrer: "no-referrer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [i, user] = await Promise.all([getI18n(), inviteUser(token)]);
  if (!user)
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">{i.m.auth.inviteInvalidTitle}</h1>
        <p className="mt-2 mb-6 text-sm text-ink-2">{i.m.auth.inviteInvalidLead}</p>
        <Link href="/login" className="btn">
          {i.m.auth.goLogin}
        </Link>
      </>
    );
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{i.fmt(i.m.auth.inviteTitle, { company: user.ws })}</h1>
      <p className="mt-1 mb-6 text-sm text-ink-2">{i.fmt(i.m.auth.inviteLead, { name: user.name })}</p>
      <InviteForm token={token} email={user.email} />
    </>
  );
}
