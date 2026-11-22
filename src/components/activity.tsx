import type { I18n } from "@/lib/i18n";

type Act = { type: string; data: Record<string, unknown>; actorId?: string };
type Col = { id: string; name: string | null; defaultKey: string | null };

/** Human sentence for one history entry, e.g. "moved the task To do → In progress". */
export function activityText(a: Act, i: I18n, people: { id: string; name: string }[], columns: Col[], sprints?: { id: string; name: string }[]) {
  const { m, fmt } = i;
  const who = (id: unknown) => people.find((p) => p.id === id)?.name ?? m.common.unknownUser;
  const col = (id: unknown) => {
    const c = columns.find((x) => x.id === id);
    return c ? i.columnName(c) : "?";
  };
  const d = a.data;
  switch (a.type) {
    case "created":
      return m.activity.created;
    case "moved":
      return fmt(m.activity.moved, { from: col(d.from), to: col(d.to) });
    case "assigned":
      return d.userId === a.actorId ? m.activity.assignedSelf : fmt(m.activity.assigned, { user: who(d.userId) });
    case "unassigned":
      return d.userId === a.actorId ? m.activity.unassignedSelf : fmt(m.activity.unassigned, { user: who(d.userId) });
    case "commented":
      return m.activity.commented;
    case "deleted":
      return fmt(m.activity.deleted, { key: String(d.key ?? "") });
    case "field": {
      const field = m.task.fields[d.field as keyof typeof m.task.fields] ?? String(d.field);
      const to =
        d.field === "priority"
          ? m.priority[d.to as "medium"]
          : d.field === "dueDate" && d.to
            ? i.day(String(d.to))
            : d.field === "title"
              ? String(d.to)
              : d.field === "sprintId" && sprints
                ? d.to
                  ? (sprints.find((s) => s.id === d.to)?.name ?? null)
                  : m.sprint.backlog
                : null;
      return to ? fmt(m.activity.fieldTo, { field, to }) : fmt(m.activity.field, { field });
    }
    default:
      return a.type;
  }
}
