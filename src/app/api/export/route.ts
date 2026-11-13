import { NextResponse, type NextRequest } from "next/server";
import { getDatabase } from "@/lib/db";
import { exportCases, ExportSelectionSchema } from "@/lib/export";
import * as log from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function filename(now = new Date()): string {
  return `usecasecn-approved-${now.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
}

/**
 * GET /api/export?status=approved[&ids=a,b][&includeExported=1][&download=1]
 * Read-only: returns a JSON array of approved cases. Marking is done by POST
 * so that a link prefetch can never change case status.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  if (status && status !== "approved") {
    return NextResponse.json({ error: "Only status=approved can be exported." }, { status: 400 });
  }
  const ids = params.get("ids")?.split(",").map((s) => s.trim()).filter(Boolean);
  const selection = ExportSelectionSchema.safeParse({
    ids: ids?.length ? ids : undefined,
    includeExported: params.get("includeExported") === "1" || undefined
  });
  if (!selection.success) return NextResponse.json({ error: "Invalid export selection." }, { status: 400 });

  try {
    const { items } = exportCases(getDatabase(), selection.data);
    const headers: Record<string, string> = {};
    if (params.get("download") === "1") headers["Content-Disposition"] = `attachment; filename="${filename()}"`;
    return NextResponse.json(items, { headers });
  } catch (err) {
    const message = log.safeErrorMessage(err);
    log.error("Export failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/export { ids?: string[], includeExported?: boolean, markExported?: boolean }
 * Returns { items, markedIds }. With markExported, approved cases become
 * `exported`; nothing is deleted.
 */
export async function POST(request: Request) {
  let body: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
    }
  }
  const selection = ExportSelectionSchema.safeParse(body);
  if (!selection.success) return NextResponse.json({ error: "Invalid export selection." }, { status: 400 });

  try {
    return NextResponse.json(exportCases(getDatabase(), selection.data));
  } catch (err) {
    const message = log.safeErrorMessage(err);
    log.error("Export failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
