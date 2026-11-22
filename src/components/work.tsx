// Shared building blocks for My work, Team and profile pages (server components).
import Link from "next/link";
import { CheckCircle2, CircleDot, Circle } from "lucide-react";
import type { I18n } from "@/lib/i18n";
import type { WorkItem } from "@/server/views";
import { DueBadge, PriorityIcon, TaskLine, taskHref } from "./ui";

const TONE = {
  doing: { Icon: CircleDot, cls: "text-brand" },
  todo: { Icon: Circle, cls: "text-ink-3" },
  done: { Icon: CheckCircle2, cls: "text-ok" },
} as const;

export function WorkSection({ kind, title, items, empty, i }: { kind: keyof typeof TONE; title: string; items: WorkItem[]; empty: string; i: I18n }) {
  const { Icon, cls } = TONE[kind];
  return (
    <section className="card p-3" aria-labelledby={`sec-${kind}`}>
      <h2 id={`sec-${kind}`} className="mb-2 flex items-center gap-2 px-2 pt-1 section-title">
        <Icon size={17} className={cls} aria-hidden />
        {title}
        <span className="ml-auto rounded-full bg-surface-2 px-2 text-xs font-semibold text-ink-2 tabular-nums">{items.length}</span>
      </h2>
      {items.length ? (
        <ul>
          {items.map((t) => (
            <li key={t.taskId + t.userId}>
              <TaskLine t={t} i={i} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 pt-1 pb-3 text-sm text-ink-3">{empty}</p>
      )}
    </section>
  );
}

/** One task in a Team lane: done items are a single line, open ones show key and due date above the title. */
export function LaneCard({ t, i, tone }: { t: WorkItem; i: I18n; tone: "now" | "next" | "done" }) {
  if (tone === "done")
    return (
      <Link href={taskHref(t.key)} title={`${t.key} ${t.title}`} className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
        <CheckCircle2 size={14} className="shrink-0 text-ok" aria-hidden />
        <span className="sr-only">{t.key}</span>
        <span className="truncate">{t.title}</span>
      </Link>
    );
  return (
    <Link
      href={taskHref(t.key)}
      className={`block rounded-md border px-2.5 py-1.5 hover:border-brand ${tone === "now" ? "border-line border-l-[3px] border-l-brand bg-surface shadow-card" : "border-dashed border-line"}`}
    >
      <span className="flex items-center gap-1.5">
        <PriorityIcon priority={t.priority} label={i.m.priority[t.priority as "medium"]} size={14} />
        <span className="text-[11px] font-semibold text-ink-3 tabular-nums">{t.key}</span>
        {t.dueDate && (
          <span className="ml-auto text-[11px]">
            <DueBadge ymd={t.dueDate} i={i} />
          </span>
        )}
      </span>
      <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink">{t.title}</span>
    </Link>
  );
}

export function Lane({ items, max, tone, empty, i, more }: { items: WorkItem[]; max: number; tone: "now" | "next" | "done"; empty: string; i: I18n; more: string }) {
  if (!items.length) return <p className="py-1.5 text-[13px] text-ink-3">{empty}</p>;
  return (
    <div className={tone === "done" ? "space-y-0.5" : "space-y-1.5"}>
      {items.slice(0, max).map((t) => (
        <LaneCard key={t.taskId} t={t} i={i} tone={tone} />
      ))}
      {items.length > max && (
        <Link href={more} className="block px-1 text-xs font-medium text-ink-2 hover:text-ink hover:underline">
          {i.fmt(i.m.common.moreCount, { n: items.length - max })}
        </Link>
      )}
    </div>
  );
}
