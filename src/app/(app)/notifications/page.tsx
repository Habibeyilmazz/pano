import Link from "next/link";
import { Bell } from "lucide-react";
import { MarkAllRead } from "@/components/forms";
import { EmptyState, PageHeader, taskHref } from "@/components/ui";
import { getI18n } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/session";
import { listNotifications } from "@/server/notifications";

export async function generateMetadata() {
  return { title: (await getI18n()).m.notifications.title };
}

export default async function NotificationsPage() {
  const ctx = await requireCtx();
  const [i, list] = await Promise.all([getI18n(), listNotifications(ctx)]);
  const { m } = i;
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={m.notifications.title} actions={unread > 0 && <MarkAllRead />} />
      {!list.length ? (
        <EmptyState title={m.notifications.empty} icon={<Bell size={28} />} />
      ) : (
        <ul className="card divide-y divide-line">
          {list.map((n) => (
            <li key={n.id}>
              <Link href={taskHref(n.taskKey)} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.readAt ? "text-ink-2" : "font-medium text-ink"}`}>
                    {!n.readAt && <span className="sr-only">{m.notifications.newBadge}: </span>}
                    {i.fmt(m.notifications[n.type as "assigned"], { actor: n.actor ?? "", key: n.taskKey })}
                  </span>
                  <span className="block truncate text-sm text-ink-3">{n.taskTitle}</span>
                </span>
                <time className="shrink-0 text-xs text-ink-3" dateTime={new Date(n.createdAt).toISOString()}>
                  {i.ago(n.createdAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
