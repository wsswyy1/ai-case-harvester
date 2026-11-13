export function ReviewQueue() {
  // TODO: fetch /api/cases?status=needs_review, filters, approve/reject actions.
  return (
    <section
      style={{
        marginTop: "2rem",
        padding: "1.5rem",
        border: "1px solid #3a2420",
        borderRadius: 8,
        background: "#140c0e"
      }}
    >
      <p>No cases are waiting for review.</p>
      <p style={{ color: "#b9a394" }}>
        Start a harvest from this page or run <code>npm run harvest</code> after
        the collectors are implemented. Items need a real project link before
        they appear here.
      </p>
    </section>
  );
}
