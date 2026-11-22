import { Suspense } from "react";
import { orNotFound, requireCtx } from "@/lib/session";
import { can } from "@/server/ctx";
import { getBoard } from "@/server/projects";
import { getTaskDetail } from "@/server/tasks";
import { Board, type View } from "./board";
import { TaskPanel } from "./task-panel";

/** Server part of the board and list views: loads the board and, with ?task=KEY, the open task. */
export async function BoardPage({ params, searchParams, view }: { params: Promise<{ key: string }>; searchParams: Promise<{ task?: string }>; view: View }) {
  const ctx = await requireCtx();
  const [{ key }, { task }] = await Promise.all([params, searchParams]);
  const [board, detail] = await Promise.all([orNotFound(getBoard(ctx, key)), task ? orNotFound(getTaskDetail(ctx, String(task))) : null]);
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      <title>{`${board.project.name} · pano`}</title>
      <Suspense>
        <Board
          board={board}
          me={ctx.userId}
          view={view}
          perms={{
            create: can(ctx, "tasks.create"),
            editAny: can(ctx, "tasks.edit_any"),
            assignSelf: can(ctx, "tasks.assign_self"),
            assignOthers: can(ctx, "tasks.assign_others"),
            manage: can(ctx, "projects.manage"),
            reports: can(ctx, "reports.view"),
          }}
        />
      </Suspense>
      {detail && detail.project.id === board.project.id && (
        <TaskPanel
          key={detail.task.id}
          detail={detail}
          me={ctx.userId}
          perms={{
            assignSelf: can(ctx, "tasks.assign_self"),
            assignOthers: can(ctx, "tasks.assign_others"),
            comment: can(ctx, "comments.create"),
            delete: can(ctx, "tasks.delete"),
            create: can(ctx, "tasks.create"),
          }}
        />
      )}
    </div>
  );
}
