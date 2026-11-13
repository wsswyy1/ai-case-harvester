import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.2em] text-pumpkin">Kiroween 2026 · Frankenstein</p>
      <h1 className="mt-2 text-4xl font-semibold">AI Case Harvester</h1>
      <p className="mt-4 text-ash">
        Stitches public collectors (Hacker News, GitHub, Reddit), an LLM classifier, and a Halloween review desk for{" "}
        <a href="https://usecasecn.xyz" className="text-hex underline underline-offset-2 hover:text-bone">
          usecasecn
        </a>
        . Approved cases go to JSON export or the pending queue, never straight to publication.
      </p>
      <p className="mt-8">
        <Link
          href="/review"
          className="inline-block rounded bg-pumpkin px-5 py-2 font-semibold text-crypt no-underline hover:brightness-110"
        >
          Enter the review graveyard →
        </Link>
      </p>
    </main>
  );
}
