import { NextResponse } from "next/server";

export async function POST() {
  // TODO: approve or reject only needs_review cases. Never call a publish API.
  return NextResponse.json(
    { error: "Review is not implemented yet." },
    { status: 501 }
  );
}
