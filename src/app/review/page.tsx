import { ReviewQueue } from "@/components/ReviewQueue";

export default function ReviewPage() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <p style={{ color: "#e07a3d", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        Graveyard queue
      </p>
      <h1>Review cases</h1>
      <p>
        Approve or reject locally. This never publishes to usecasecn. Start a
        harvest once collectors are implemented, or load the empty state below.
      </p>
      <ReviewQueue />
    </main>
  );
}
