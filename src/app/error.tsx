"use client";
import { useI18n } from "@/lib/i18n/client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { m } = useI18n();
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm text-ink-2" role="alert">
        {m.errors.generic}
      </p>
      <button className="btn btn-primary" onClick={reset}>
        {m.common.retry}
      </button>
    </main>
  );
}
