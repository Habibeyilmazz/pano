// Presentational pieces shared by server and client components. No hooks here.
import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, Equal } from "lucide-react";
import type { I18n } from "@/lib/i18n";

function hue(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase("tr-TR"))
    .join("");
}

export function Avatar({ id, name, size = 28, title }: { id: string; name: string; size?: number; title?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-surface"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue(id)} 42% 36%)` }}
      title={title ?? name}
      aria-hidden={title === "" ? true : undefined}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 3, size = 24 }: { people: { id: string; name: string }[]; max?: number; size?: number }) {
  if (!people.length) return null;
  const shown = people.slice(0, max);
  return (
    <span className="flex -space-x-1.5" aria-label={people.map((p) => p.name).join(", ")} role="img">
      {shown.map((p) => (
        <Avatar key={p.id} id={p.id} name={p.name} size={size} title="" />
      ))}
      {people.length > max && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-ink-2 ring-2 ring-surface"
          style={{ width: size, height: size }}
          aria-hidden
        >
          +{people.length - max}
        </span>
      )}
    </span>
  );
}

const PRIORITY = {
  highest: { Icon: ChevronsUp, color: "text-danger" },
  high: { Icon: ChevronUp, color: "text-[#c2410c] dark:text-[#fb923c]" },
  medium: { Icon: Equal, color: "text-warn" },
  low: { Icon: ChevronDown, color: "text-[#2563eb] dark:text-[#7aa7ff]" },
  lowest: { Icon: ChevronsDown, color: "text-ink-3" },
} as const;

export function PriorityIcon({ priority, label, size = 16 }: { priority: string; label: string; size?: number }) {
  const p = PRIORITY[priority as keyof typeof PRIORITY] ?? PRIORITY.medium;
  return (
    <span className={`inline-flex ${p.color}`} title={label} role="img" aria-label={label}>
      <p.Icon size={size} strokeWidth={2.5} aria-hidden />
    </span>
  );
}

export function DueBadge({ ymd, done, i }: { ymd: string; done?: boolean; i: I18n }) {
  const d = i.due(ymd, done);
  const tone =
    d.tone === "late" ? "bg-danger-soft text-danger" : d.tone === "soon" ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2";
  return (
    <time dateTime={ymd} className={`tag ${tone}`}>
      {d.text}
    </time>
  );
}

export function EmptyState({ title, lead, children, icon }: { title: string; lead?: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-6 py-10 text-center">
      {icon && <div className="mb-1 text-ink-3">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {lead && <p className="max-w-md text-sm text-ink-2">{lead}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, lead, actions }: { title: string; lead?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {lead && <p className="mt-1 max-w-2xl text-sm text-ink-2">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const taskHref = (key: string) => `/projects/${key.split("-")[0]}?task=${key}`;

/** One task in a list (My work, Team, search, dashboard). */
export function TaskLine({
  t,
  i,
  showProject = true,
}: {
  t: { key: string; title: string; priority: string; dueDate: string | null; category?: string; columnName?: string | null; columnKey?: string | null };
  i: I18n;
  showProject?: boolean;
}) {
  return (
    <Link
      href={taskHref(t.key)}
      className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2 focus-visible:bg-surface-2"
    >
      <PriorityIcon priority={t.priority} label={i.m.priority[t.priority as "medium"]} />
      {showProject && <span className="shrink-0 text-xs font-semibold text-ink-3 tabular-nums">{t.key}</span>}
      <span className="min-w-0 flex-1 truncate text-sm text-ink group-hover:underline">{t.title}</span>
      {t.columnKey !== undefined && t.category === "doing" && (
        <span className="hidden shrink-0 text-xs text-ink-3 sm:inline">{i.columnName({ name: t.columnName ?? null, defaultKey: t.columnKey ?? null })}</span>
      )}
      {t.dueDate && <DueBadge ymd={t.dueDate} done={t.category === "done"} i={i} />}
    </Link>
  );
}

/** Wordmark: three columns of cards, the middle one in motion. */
export function Logo({ className = "text-ink" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect x="1" y="2" width="5.5" height="7" rx="1.5" fill="currentColor" opacity=".35" />
        <rect x="1" y="11" width="5.5" height="5" rx="1.5" fill="currentColor" opacity=".35" />
        <rect x="8.25" y="5" width="5.5" height="9" rx="1.5" fill="var(--brand)" />
        <rect x="15.5" y="2" width="5.5" height="5" rx="1.5" fill="currentColor" opacity=".35" />
        <rect x="15.5" y="9" width="5.5" height="7" rx="1.5" fill="currentColor" opacity=".35" />
        <rect x="1" y="18.5" width="20" height="1.5" rx=".75" fill="currentColor" opacity=".2" />
      </svg>
      <span className="text-lg font-bold tracking-tight">pano</span>
    </span>
  );
}
