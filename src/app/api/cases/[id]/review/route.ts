import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import * as log from "@/lib/log";
import { reviewCase } from "@/lib/review";
import { ReviewDecisionSchema } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cases/:id/review  { "decision": "approved" | "rejected", "reason"?: string }
 * Local decision only. Never publishes or calls a usecasecn approval API.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const decision = ReviewDecisionSchema.safeParse(body);
  if (!decision.success) {
    return NextResponse.json(
      { error: 'Body must be { "decision": "approved" | "rejected", "reason"?: string }.' },
      { status: 400 }
    );
  }

  try {
    const outcome = reviewCase(getDatabase(), id, decision.data);
    if (outcome.ok) return NextResponse.json({ case: outcome.record });
    if (outcome.code === "not_found") return NextResponse.json({ error: outcome.message }, { status: 404 });
    return NextResponse.json({ error: outcome.message, currentStatus: outcome.currentStatus }, { status: 409 });
  } catch (err) {
    const message = log.safeErrorMessage(err);
    log.error("Review failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
