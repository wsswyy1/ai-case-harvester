import { NextResponse } from "next/server";

export async function POST() {
  // TODO: push approved cases to usecasecn pending intake only.
  // Refuse if USECASECN_API_URL or USECASECN_INGEST_TOKEN is missing.
  // Never log the token. Stop on 429.
  return NextResponse.json(
    { error: "Push is not implemented yet." },
    { status: 501 }
  );
}
