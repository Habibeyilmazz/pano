import { redirect } from "next/navigation";
import { SignupForm } from "@/components/auth-forms";
import { getI18n } from "@/lib/i18n/server";
import { getCtx } from "@/lib/session";

export async function generateMetadata() {
  return { title: (await getI18n()).m.auth.createCompany };
}

export default async function SignupPage() {
  if (await getCtx()) redirect("/my-work");
  return <SignupForm />;
}
