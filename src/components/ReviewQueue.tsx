"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { USECASECN_CATEGORIES, type CaseRecord, type SourceName, type UsecasecnCategory } from "@/lib/types";
import { CaseCard } from "./CaseCard";
import { HarvestPanel } from "./HarvestPanel";

const SOURCE_OPTIONS: { value: SourceName; label: string }[] = [
  { value: "hn", label: "Hacker News" },
  { value: "github", label: "GitHub" },
  { value: "reddit", label: "Reddit" }
];

const CONFIDENCE_OPTIONS = [
  { value: "", label: "Any confidence" },
  { value: "0.8", label: "≥ 80%" },
  { value: "0.6", label: "≥ 60%" },
  { value: "low", label: "Low confidence only" }
];

interface Filters {
  source: SourceName | "";
  category: UsecasecnCategory | "";
  confidence: string;
}

function queryString(filters: Filters): string {
  const qs = new URLSearchParams({ status: "needs_review" });
  if (filters.source) qs.set("source", filters.source);
  if (filters.category) qs.set("category", filters.category);
  if (filters.confidence && filters.confidence !== "low") qs.set("minConfidence", filters.confidence);
  return qs.toString();
}

export function ReviewQueue({ initialCases, initialError = null }: { initialCases: CaseRecord[]; initialError?: string | null }) {
  const [cases, setCases] = useState<CaseRecord[]>(initialCases);
  const [filters, setFilters] = useState<Filters>({ source: "", category: "", confidence: "" });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(initialError);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const firstRender = useRef(true);

  const reload = useCallback(async (f: Filters) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/cases?${queryString(f)}`, { cache: "no-store" });
      const body = (await res.json()) as { cases?: CaseRecord[]; error?: string };
      if (!res.ok || !body.cases) throw new Error(body.error ?? `Could not load cases (HTTP ${res.status}).`);
      setCases(body.cases);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void reload(filters);
  }, [filters, reload]);

  async function decide(record: CaseRecord, decision: "approved" | "rejected", reason?: string) {
    setBusyId(record.id);
    setCardErrors(({ [record.id]: _drop, ...rest }) => rest);
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(record.id)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason })
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Review failed (HTTP ${res.status}).`);
      setCases((prev) => prev.filter((c) => c.id !== record.id));
      setNotice(`${decision === "approved" ? "Approved" : "Rejected"}: ${record.title}. Nothing was published to usecasecn.`);
    } catch (err) {
      setCardErrors((prev) => ({ ...prev, [record.id]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusyId(null);
    }
  }

  const visible = filters.confidence === "low" ? cases.filter((c) => c.lowConfidence) : cases;
  const filtered = Boolean(filters.source || filters.category || filters.confidence);

  return (
    <div className="mt-6 flex flex-col gap-6">
      <HarvestPanel onFinished={() => void reload(filters)} />

      <section aria-label="Filters" className="flex flex-wrap items-center gap-3 text-sm">
        <select
          aria-label="Source"
          value={filters.source}
          onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value as Filters["source"] }))}
          className="rounded border border-grave bg-tomb px-2 py-1.5 text-bone"
        >
          <option value="">All sources</option>
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Category"
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value as Filters["category"] }))}
          className="rounded border border-grave bg-tomb px-2 py-1.5 text-bone"
        >
          <option value="">All categories</option>
          {USECASECN_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Confidence"
          value={filters.confidence}
          onChange={(e) => setFilters((f) => ({ ...f, confidence: e.target.value }))}
          className="rounded border border-grave bg-tomb px-2 py-1.5 text-bone"
        >
          {CONFIDENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-ash" aria-live="polite">
          {loading ? "Digging…" : `${visible.length} waiting in the graveyard`}
        </span>
      </section>

      {notice ? (
        <p role="status" className="m-0 rounded border border-grave bg-tomb px-3 py-2 text-sm text-ash">
          {notice}
        </p>
      ) : null}

      {loadError ? (
        <p role="alert" className="m-0 rounded border border-pumpkin/60 px-3 py-2 text-sm text-pumpkin">
          {loadError}
        </p>
      ) : null}

      {visible.length === 0 && !loading && !loadError ? (
        <EmptyState filtered={filtered} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {visible.map((record) => (
            <li key={record.id}>
              <CaseCard
                record={record}
                busy={busyId === record.id}
                error={cardErrors[record.id] ?? null}
                onDecision={(decision, reason) => void decide(record, decision, reason)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <section className="rounded-lg border border-dashed border-grave bg-tomb/60 p-8 text-center">
      <p aria-hidden className="m-0 text-4xl">
        🕸️
      </p>
      <h2 className="mt-2 text-lg font-semibold">
        {filtered ? "No cases match these filters." : "No cases are waiting for review."}
      </h2>
      <p className="mx-auto mt-2 max-w-prose text-sm text-ash">
        {filtered ? (
          "Clear a filter to see the rest of the queue."
        ) : (
          <>
            Start a harvest with the button above, or run <code className="text-bone">npm run harvest</code> in a
            terminal. Set <code className="text-bone">LLM_BASE_URL</code>, <code className="text-bone">LLM_API_KEY</code>,
            and <code className="text-bone">LLM_MODEL</code> in <code className="text-bone">.env</code> first. Without a
            classifier, harvested posts are stored but do not reach this queue. Only posts with a concrete project link
            that the classifier judges to be a real AI case appear here.
          </>
        )}
      </p>
    </section>
  );
}
