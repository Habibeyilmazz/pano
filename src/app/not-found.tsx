import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { m } = await getI18n();
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-semibold text-ink-3 tabular-nums">404</p>
      <h1 className="text-xl font-semibold">{m.errors.notFoundTitle}</h1>
      <p className="text-sm text-ink-2">{m.errors.notFoundLead}</p>
      <Link href="/my-work" className="btn btn-primary mt-2">
        {m.errors.goHome}
      </Link>
    </main>
  );
}
