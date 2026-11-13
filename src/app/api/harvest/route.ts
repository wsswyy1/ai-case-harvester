import { NextResponse } from "next/server";
import { DatabaseOpenError } from "@/lib/db";
import { ConfigError } from "@/lib/env";
import { runHarvest } from "@/lib/harvest";
import { HarvestInputSchema, toHarvestOptions } from "@/lib/harvest-input";
import * as log from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const input = HarvestInputSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      { error: "Invalid harvest request.", issues: input.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 }
    );
  }

  try {
    const result = await runHarvest(toHarvestOptions(input.data));
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = log.safeErrorMessage(err);
    log.error("Harvest failed:", message);
    const status = err instanceof ConfigError ? 400 : err instanceof DatabaseOpenError ? 500 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
