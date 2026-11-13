import { NextResponse } from "next/server";

export async function POST() {
  // TODO: parse body (sources, since, limit), call runHarvest, return the run summary.
  return NextResponse.json(
    { error: "Harvest orchestration is not implemented yet." },
    { status: 501 }
  );
}
