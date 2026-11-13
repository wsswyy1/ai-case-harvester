"use client";

import { useState } from "react";

/** Export approved cases, or push them to the usecasecn pending queue (never publishes). */
export function ShipPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function exportAndMark() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markExported: true })
      });
      const body = (await res.json()) as { items?: unknown[]; markedIds?: string[]; error?: string };
      if (!res.ok || !body.items) throw new Error(body.error ?? `Export failed (HTTP ${res.status}).`);
      const blob = new Blob([JSON.stringify(body.items, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `usecasecn-approved-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${body.items.length} case(s); ${body.markedIds?.length ?? 0} marked as exported.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function push() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = (await res.json()) as {
        results?: { outcome: string; title: string; message?: string }[];
        stoppedReason?: string;
        error?: string;
      };
      if (!res.ok || !body.results) throw new Error(body.error ?? `Push failed (HTTP ${res.status}).`);
      const counts = body.results.reduce<Record<string, number>>((acc, r) => ((acc[r.outcome] = (acc[r.outcome] ?? 0) + 1), acc), {});
      const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`);
      setMessage(
        body.results.length === 0
          ? "No approved cases to push."
          : `Pending intake: ${parts.join(", ")}.${body.stoppedReason ? ` Stopped: ${body.stoppedReason}` : ""}`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="ship-heading" className="rounded-lg border border-grave bg-tomb p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="ship-heading" className="m-0 mr-auto text-base font-semibold">
          Approved cases <span className="text-sm font-normal text-ash">(export or push to pending)</span>
        </h2>
        <a
          href="/api/export?status=approved&download=1"
          className="rounded border border-ghoul px-4 py-1.5 text-sm text-hex no-underline hover:bg-ghoul/20"
        >
          Download JSON
        </a>
        <button
          type="button"
          onClick={exportAndMark}
          disabled={busy}
          className="rounded border border-ghoul bg-ghoul/30 px-4 py-1.5 text-sm text-bone hover:bg-ghoul/50 disabled:opacity-50"
        >
          Download &amp; mark exported
        </button>
        <button
          type="button"
          onClick={push}
          disabled={busy}
          title="Sends approved cases to the usecasecn pending queue. Site operators review them; nothing is published."
          className="rounded bg-pumpkin px-4 py-1.5 text-sm font-semibold text-crypt hover:brightness-110 disabled:opacity-50"
        >
          Push to pending
        </button>
      </div>
      {message ? (
        <p role="status" className="m-0 mt-2 text-sm text-ash">
          {message}
        </p>
      ) : null}
    </section>
  );
}
