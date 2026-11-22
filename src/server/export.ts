import { getBoard } from "./projects";
import type { Ctx } from "./ctx";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote everything; a leading = + - @ would run as a formula in Excel, so prefix a quote.
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export async function exportCsv(ctx: Ctx, projectKey: string, columnName: (c: { name: string | null; defaultKey: string | null }) => string, headers: string[]) {
  const board = await getBoard(ctx, projectKey);
  const people = new Map(board.people.map((p) => [p.id, p.name]));
  const cols = new Map(board.columns.map((c) => [c.id, columnName(c)]));
  const lines = board.tasks.map((t) =>
    [
      t.key,
      t.title,
      cols.get(t.columnId),
      t.priority,
      t.assigneeIds.map((id) => people.get(id) ?? "").join(", "),
      t.dueDate,
      t.estimate,
      t.labels.join(", "),
      t.createdAt.toISOString(),
    ]
      .map(cell)
      .join(","),
  );
  // BOM so Excel opens Turkish characters correctly.
  return "﻿" + [headers.map(cell).join(","), ...lines].join("\r\n");
}
