"use client";

import { useState } from "react";
import type { HarvestRun, SourceName } from "@/lib/types";

const SOURCES: SourceName[] = ["hn", "github", "reddit"];

export function HarvestPanel({ onFinished }: { onFinished?: (run: HarvestRun) => void }) {
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<HarvestRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sinceHours, setSinceHours] = useState(72);
  const [limit, setLimit] = useState(15);

  async function start() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/harvest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceHours, limit })
      });
      const body = (await res.json()) as { run?: HarvestRun; error?: string };
      if (!res.ok || !body.run) throw new Error(body.error ?? `Harvest failed (HTTP ${res.status}).`);
      setRun(body.run);
      onFinished?.(body.run);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section aria-labelledby="harvest-heading" className="rounded-lg border border-grave bg-tomb p-4">
      <div className="flex flex-wrap items-end gap-3">
        <h2 id="harvest-heading" className="m-0 mr-auto text-base font-semibold">
          Raise the dead <span className="text-sm font-normal text-ash">(start a harvest)</span>
        </h2>
        <label className="text-sm text-ash">
          Since (hours)
          <input
            type="number"
            min={1}
            max={2160}
            value={sinceHours}
            onChange={(e) => setSinceHours(Number(e.target.value) || 1)}
            className="ml-2 w-20 rounded border border-grave bg-crypt px-2 py-1 text-bone"
          />
        </label>
        <label className="text-sm text-ash">
          Limit / source
          <input
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 1)}
            className="ml-2 w-16 rounded border border-grave bg-crypt px-2 py-1 text-bone"
          />
        </label>
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="rounded bg-pumpkin px-4 py-1.5 text-sm font-semibold text-crypt hover:brightness-110 disabled:opacity-60"
        >
          {running ? "Harvesting… (polite delays apply)" : "Start harvest"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-pumpkin">
          {error}
        </p>
      ) : null}

      {run ? (
        <div className="mt-3 text-sm text-ash" aria-live="polite">
          <p className="m-0">
            Run finished{run.partial ? <span className="text-pumpkin"> (partial)</span> : null}: {run.totals.queued} queued,{" "}
            {run.totals.duplicates} duplicates, {run.totals.prefiltered} pre-filtered, {run.totals.classified} classified
            {run.totals.unclassified ? `, ${run.totals.unclassified} left unclassified` : ""}.
          </p>
          <ul className="m-0 mt-1 flex list-none flex-wrap gap-x-5 p-0">
            {SOURCES.filter((s) => run.perSource[s].enabled).map((s) => {
              const p = run.perSource[s];
              return (
                <li key={s}>
                  <span className="text-bone">{s}</span> fetched {p.fetched} · kept {p.kept} · skipped {p.skipped} · failed {p.failed}
                  {p.stoppedOnRateLimit ? (
                    <span className="text-pumpkin"> · stopped on 429{p.retryAfterSeconds !== undefined ? ` (retry after ${p.retryAfterSeconds}s)` : ""}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {run.error ? <p className="m-0 mt-1 text-pumpkin">{run.error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
