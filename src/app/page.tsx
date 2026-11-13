import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem" }}>
      <p style={{ color: "#e07a3d", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        Kiroween 2026 · Frankenstein
      </p>
      <h1>AI Case Harvester</h1>
      <p>
        Stitches public collectors, an LLM classifier, and a Halloween review desk
        for{" "}
        <a href="https://usecasecn.xyz" style={{ color: "#d9b8ff" }}>
          usecasecn
        </a>
        . Approved cases go to export or the pending queue — never straight to
        publication.
      </p>
      <p>
        <Link href="/review" style={{ color: "#e07a3d" }}>
          Enter the review graveyard →
        </Link>
      </p>
    </main>
  );
}
