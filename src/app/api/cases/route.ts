import { NextResponse, type NextRequest } from "next/server";
import { getDatabase } from "@/lib/db";
import * as log from "@/lib/log";
import { listCases, parseCaseQuery } from "@/lib/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/cases?status=needs_review&source=hn&category=工作与效率&minConfidence=0.6 */
export async function GET(request: NextRequest) {
  const query = parseCaseQuery(request.nextUrl.searchParams);
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid filter.", issues: query.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`) },
      { status: 400 }
    );
  }
  try {
    const cases = listCases(getDatabase(), query.data);
    return NextResponse.json({ cases, count: cases.length });
  } catch (err) {
    const message = log.safeErrorMessage(err);
    log.error("Listing cases failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
