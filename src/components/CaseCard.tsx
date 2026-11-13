import type { CaseRecord } from "@/lib/types";

export function CaseCard({ record }: { record: CaseRecord }) {
  return (
    <article
      style={{
        padding: "1rem 0",
        borderBottom: "1px solid #3a2420"
      }}
    >
      <h2 style={{ margin: "0 0 0.5rem" }}>{record.title}</h2>
      <p style={{ margin: 0, color: "#b9a394" }}>
        {record.author} · {record.source} · {record.category ?? "uncategorized"}
      </p>
      {record.summaryZh ? <p>{record.summaryZh}</p> : null}
      {/* TODO: project link, excerpt, confidence, Approve / Reject actions */}
    </article>
  );
}
