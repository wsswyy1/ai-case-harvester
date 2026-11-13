import { NextResponse } from "next/server";

export async function GET() {
  // TODO: list cases with status, source, and category filters.
  return NextResponse.json({ cases: [] });
}
