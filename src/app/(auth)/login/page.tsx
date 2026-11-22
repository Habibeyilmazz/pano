import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth-forms";
import { getI18n } from "@/lib/i18n/server";
import { getCtx } from "@/lib/session";

export async function generateMetadata() {
  return { title: (await getI18n()).m.auth.signIn };
}

export default async function LoginPage() {
  if (await getCtx()) redirect("/my-work");
  return <LoginForm />;
}
