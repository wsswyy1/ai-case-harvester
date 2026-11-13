import Link from "next/link";
import { ReviewQueue } from "@/components/ReviewQueue";
import { getDatabase } from "@/lib/db";
import * as log from "@/lib/log";
import type { CaseRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review graveyard · AI Case Harvester"
};

function loadQueue(): { cases: CaseRecord[]; error: string | null } {
  try {
    return { cases: getDatabase().listCases({ status: "needs_review" }), error: null };
  } catch (err) {
    const message = log.safeErrorMessage(err);
    log.error("Could not load the review queue:", message);
    return { cases: [], error: `Could not open the case database: ${message}` };
  }
}

export default function ReviewPage() {
  const { cases, error } = loadQueue();

  return (
    <main className="relative mx-auto max-w-4xl px-6 py-10">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(ellipse_at_top,rgba(107,79,143,0.25),transparent_70%)]"
      />
      <nav className="text-sm">
        <Link href="/" className="text-ash hover:text-bone">
          ← AI Case Harvester
        </Link>
      </nav>
      <p className="mt-6 text-xs uppercase tracking-[0.2em] text-pumpkin">🎃 Graveyard queue</p>
      <h1 className="mt-1 text-3xl font-semibold">Review cases</h1>
      <p className="mt-2 max-w-prose text-ash">
        Approve or reject each case after reading it. Decisions are local: nothing here publishes to usecasecn.
        Approved cases can be exported as JSON or sent to the usecasecn <strong className="text-bone">pending</strong>{" "}
        queue, where site operators review them.
      </p>
      <ReviewQueue initialCases={cases} initialError={error} />
    </main>
  );
}
