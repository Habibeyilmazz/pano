import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageHeader, TaskLine } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/session";
import { SEARCH_PAGE, searchTasks } from "@/server/tasks";

export async function generateMetadata() {
  return { title: (await getI18n()).m.search.title };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const q = String(sp.q ?? "").slice(0, 100);
  // 1-based in the URL; garbage means the first page.
  const page = Math.min(Math.max(1, Number.parseInt(String(sp.p ?? "1"), 10) || 1), 10_000) - 1;
  const [i, results] = await Promise.all([getI18n(), searchTasks(ctx, q, page)]);
  const { m } = i;
  const total = results[0]?.total ?? 0;
  const from = page * SEARCH_PAGE + 1;
  const pageHref = (n: number) => `/search?${new URLSearchParams({ q, p: String(n + 1) })}`;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={q ? i.fmt(m.search.resultsFor, { q }) : m.search.title} lead={q ? i.plural(m.search.results, total) : m.search.hint} />
      <form action="/search" role="search" className="mb-6 flex gap-2">
        <label htmlFor="q" className="sr-only">
          {m.nav.search}
        </label>
        <input id="q" name="q" type="search" defaultValue={q} className="input" placeholder={m.nav.searchPlaceholder} />
        <button className="btn btn-primary shrink-0">{m.search.title}</button>
      </form>
      {q && !results.length && <EmptyState title={i.fmt(m.search.empty, { q })} lead={m.search.hint} icon={<Search size={28} />} />}
      {results.length > 0 && (
        <ul className="card divide-y divide-line p-1">
          {results.map((t) => (
            <li key={t.id} className="flex items-center gap-2 pr-2">
              <div className="min-w-0 flex-1">
                <TaskLine t={{ ...t, columnKey: undefined }} i={i} />
              </div>
              <span className="hidden shrink-0 text-xs text-ink-3 sm:block">{i.columnName({ name: t.columnName, defaultKey: t.columnKey })}</span>
            </li>
          ))}
        </ul>
      )}
      {total > results.length && (
        <nav aria-label={m.search.title} className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-3">
          <p className="mr-auto">{i.fmt(m.search.range, { from: i.num(from), to: i.num(from + results.length - 1) })}</p>
          {page > 0 && (
            <Link className="btn btn-ghost" href={pageHref(page - 1)}>
              <ChevronLeft size={16} aria-hidden /> {m.search.newer}
            </Link>
          )}
          {from + results.length - 1 < total && (
            <Link className="btn btn-ghost" href={pageHref(page + 1)}>
              {m.search.older} <ChevronRight size={16} aria-hidden />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
