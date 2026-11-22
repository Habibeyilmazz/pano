import { getI18n } from "@/lib/i18n/server";
import { getCtx } from "@/lib/session";
import { exportCsv } from "@/server/export";
import { AppError } from "@/lib/errors";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const ctx = await getCtx();
  if (!ctx || ctx.mustChangePassword) return new Response("Unauthorized", { status: 401 });
  const { key } = await params;
  const i = await getI18n();
  try {
    const csv = await exportCsv(ctx, key, i.columnName, i.m.board.csv);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${key.toUpperCase().replace(/[^A-Z0-9]/g, "")}-tasks.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new Response("Not found", { status: 404 });
    throw e;
  }
}
