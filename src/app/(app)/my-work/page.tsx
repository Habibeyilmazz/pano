import Link from "next/link";
import { ListChecks } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { WorkSection } from "@/components/work";
import { getI18n } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/session";
import { myWork } from "@/server/views";

export async function generateMetadata() {
  return { title: (await getI18n()).m.myWork.title };
}

export default async function MyWorkPage() {
  const ctx = await requireCtx();
  const [i, w] = await Promise.all([getI18n(), myWork(ctx)]);
  const { m } = i;
  const empty = !w.doing.length && !w.todo.length && !w.done.length;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={m.myWork.title}
        lead={m.myWork.lead}
        actions={
          w.overdue > 0 && (
            <span className="tag bg-danger-soft px-2.5 py-1 text-sm text-danger">{i.plural(m.myWork.overdueCount, w.overdue)}</span>
          )
        }
      />
      {empty ? (
        <EmptyState title={m.myWork.emptyAllTitle} lead={m.myWork.emptyAllLead} icon={<ListChecks size={28} />}>
          <Link href="/projects" className="btn btn-primary">
            {m.myWork.goProjects}
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <WorkSection kind="doing" title={m.myWork.doing} items={w.doing} empty={m.myWork.emptyDoing} i={i} />
          <WorkSection kind="todo" title={m.myWork.todo} items={w.todo} empty={m.myWork.emptyTodo} i={i} />
          <WorkSection kind="done" title={m.myWork.done} items={w.done} empty={m.myWork.emptyDone} i={i} />
        </div>
      )}
    </div>
  );
}
