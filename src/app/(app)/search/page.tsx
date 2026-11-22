import { Search } from "lucide-react";
import { EmptyState, PageHeader, TaskLine } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/session";
import { searchTasks } from "@/server/tasks";

export async function generateMetadata() {
  return { title: (await getI18n()).m.search.title };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx();
  const q = String((await searchParams).q ?? "").slice(0, 100);
  const [i, results] = await Promise.all([getI18n(), searchTasks(ctx, q)]);
  const { m } = i;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={q ? i.fmt(m.search.resultsFor, { q }) : m.search.title} lead={q ? i.plural(m.search.results, results.length) : m.search.hint} />
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
    </div>
  );
}
