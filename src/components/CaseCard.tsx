"use client";

import { useState } from "react";
import type { CaseRecord } from "@/lib/types";
import { safeHref } from "./safe-href";

const SOURCE_LABEL: Record<CaseRecord["source"], string> = {
  hn: "Hacker News",
  github: "GitHub",
  reddit: "Reddit"
};

export interface CaseCardProps {
  record: CaseRecord;
  busy?: boolean;
  error?: string | null;
  onDecision?: (decision: "approved" | "rejected", reason?: string) => void;
}

export function CaseCard({ record, busy = false, error = null, onDecision }: CaseCardProps) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const project = safeHref(record.projectUrl);
  const source = safeHref(record.sourceUrl);
  const confidencePct = record.confidence === null ? null : Math.round(record.confidence * 100);

  return (
    <article
      aria-labelledby={`case-${record.id}-title`}
      className="relative rounded-lg border border-grave bg-tomb/90 p-5 shadow-[0_0_0_1px_rgba(224,122,61,0.04),0_10px_30px_-12px_rgba(0,0,0,0.8)]"
    >
      <span aria-hidden className="pointer-events-none absolute right-4 top-3 select-none text-2xl opacity-30">
        🪦
      </span>

      <header className="pr-10">
        <h2 id={`case-${record.id}-title`} className="m-0 text-lg font-semibold leading-snug text-bone">
          {record.title}
        </h2>
        <p className="mt-1 text-sm text-ash">
          <span>{record.author || "unknown author"}</span>
          <span aria-hidden> · </span>
          {source ? (
            <a href={source} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-grave underline-offset-2 hover:text-bone">
              {SOURCE_LABEL[record.source]}
            </a>
          ) : (
            <span>{SOURCE_LABEL[record.source]}</span>
          )}
          {record.relatedSources.length > 0 ? (
            <span title={record.relatedSources.join("\n")}> · +{record.relatedSources.length} related</span>
          ) : null}
        </p>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-ash">Project</dt>
        <dd className="m-0 break-all">
          {project ? (
            <a href={project} target="_blank" rel="noopener noreferrer nofollow" className="text-hex underline underline-offset-2 hover:text-bone">
              {record.projectUrl}
            </a>
          ) : (
            <span className="text-ash">none</span>
          )}
        </dd>

        <dt className="text-ash">Category</dt>
        <dd className="m-0">{record.category ?? <span className="text-ash">uncategorized</span>}</dd>

        <dt className="text-ash">Tools</dt>
        <dd className="m-0 flex flex-wrap gap-1.5">
          {record.tools.length ? (
            record.tools.map((t) => (
              <span key={t} className="rounded border border-ghoul/60 bg-ghoul/15 px-2 py-0.5 text-xs text-hex">
                {t}
              </span>
            ))
          ) : (
            <span className="text-ash">none tagged</span>
          )}
        </dd>

        <dt className="text-ash">Confidence</dt>
        <dd className="m-0 flex items-center gap-2">
          {confidencePct === null ? (
            <span className="text-ash">n/a</span>
          ) : (
            <>
              <span className="tabular-nums">{confidencePct}%</span>
              <span aria-hidden className="h-1.5 w-24 overflow-hidden rounded bg-grave">
                <span className="block h-full bg-pumpkin" style={{ width: `${confidencePct}%` }} />
              </span>
            </>
          )}
          {record.lowConfidence ? (
            <span className="rounded border border-pumpkin/60 px-1.5 py-0.5 text-xs text-pumpkin">low confidence</span>
          ) : null}
        </dd>
      </dl>

      {record.summaryZh ? (
        <p lang="zh-CN" className="mt-4 border-l-2 border-pumpkin/70 pl-3 text-base text-bone">
          {record.summaryZh}
        </p>
      ) : null}

      {record.excerpt ? (
        <details className="mt-3 text-sm text-ash">
          <summary className="cursor-pointer select-none text-ash hover:text-bone">Excerpt</summary>
          <p className="mt-2 whitespace-pre-line">{record.excerpt}</p>
        </details>
      ) : null}

      {record.rationale ? <p className="mt-2 text-xs italic text-ash">Classifier: {record.rationale}</p> : null}

      {onDecision ? (
        <footer className="mt-5 flex flex-wrap items-center gap-2">
          {!rejecting ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecision("approved")}
                className="rounded bg-pumpkin px-4 py-1.5 text-sm font-semibold text-crypt hover:brightness-110 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejecting(true)}
                className="rounded border border-ghoul px-4 py-1.5 text-sm text-hex hover:bg-ghoul/20 disabled:opacity-50"
              >
                Reject
              </button>
            </>
          ) : (
            <form
              className="flex w-full flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onDecision("rejected", reason.trim() || undefined);
              }}
            >
              <label className="sr-only" htmlFor={`reason-${record.id}`}>
                Reject reason (optional)
              </label>
              <input
                id={`reason-${record.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
                placeholder="Reason (optional)"
                className="min-w-0 flex-1 rounded border border-grave bg-crypt px-3 py-1.5 text-sm text-bone placeholder:text-ash/70"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded border border-ghoul bg-ghoul/30 px-4 py-1.5 text-sm text-bone hover:bg-ghoul/50 disabled:opacity-50"
              >
                Confirm reject
              </button>
              <button type="button" onClick={() => setRejecting(false)} className="px-2 text-sm text-ash hover:text-bone">
                Cancel
              </button>
            </form>
          )}
          {error ? (
            <p role="alert" className="w-full text-sm text-pumpkin">
              {error}
            </p>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
