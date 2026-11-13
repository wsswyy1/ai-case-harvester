import { NextResponse } from "next/server";
import { z } from "zod";
import { pushPending } from "@/ingest/client";
import { getDatabase } from "@/lib/db";
import { ConfigError } from "@/lib/env";
import * as log from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PushBodySchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(1000).optional(),
    batchId: z.string().trim().min(1).max(100).optional()
  })
  .strict();

/**
 * POST /api/push { ids?: string[], batchId?: string }
 * Sends approved cases to the usecasecn pending intake only. Refuses when
 * USECASECN_API_URL or USECASECN_INGEST_TOKEN is missing.
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
  const input = PushBodySchema.safeParse(body);
  if (!input.success) return NextResponse.json({ error: "Body must be { ids?: string[], batchId?: string }." }, { status: 400 });

  try {
    const result = await pushPending(input.data, { db: getDatabase() });
    return NextResponse.json(result);
  } catch (err) {
    const message = log.safeErrorMessage(err);
    if (err instanceof ConfigError) {
      return NextResponse.json({ error: message, exportAvailable: true }, { status: 400 });
    }
    log.error("Push failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
