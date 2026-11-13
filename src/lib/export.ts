import { z } from "zod";
import type { Database } from "./db";
import type { CaseRecord, CaseStatus } from "./types";

/** One exported case (Requirement 9.2). */
export interface ExportedCase {
  id: string;
  title: string;
  /** Chinese summary of the case. */
  summary: string;
  author: string;
  source: CaseRecord["source"];
  sourceUrl: string;
  projectUrl: string | null;
  tools: string[];
  category: CaseRecord["category"];
  evidenceExcerpt: string;
  /** Chinese one-line summary written by the classifier. */
  oneLinerZh: string;
  relatedSources: string[];
  confidence: number | null;
  lowConfidence: boolean;
  reviewedAt: string | null;
  status: CaseStatus;
}

export function toExportedCase(record: CaseRecord): ExportedCase {
  const oneLiner = record.summaryZh ?? "";
  return {
    id: record.id,
    title: record.title,
    summary: oneLiner,
    author: record.author,
    source: record.source,
    sourceUrl: record.sourceUrl,
    projectUrl: record.projectUrl,
    tools: record.tools,
    category: record.category,
    evidenceExcerpt: record.excerpt,
    oneLinerZh: oneLiner,
    relatedSources: record.relatedSources,
    confidence: record.confidence,
    lowConfidence: record.lowConfidence,
    reviewedAt: record.reviewedAt,
    status: record.status
  };
}

/** Statuses that can appear in an export. Re-exporting already exported cases is allowed. */
const EXPORTABLE: CaseStatus[] = ["approved", "exported"];

export const ExportSelectionSchema = z
  .object({
    /** Subset of case ids. Omit for all approved cases. */
    ids: z.array(z.string().min(1)).min(1).max(1000).optional(),
    /** Include cases already marked exported. Default false. */
    includeExported: z.boolean().optional(),
    /** Mark approved cases as exported after building the export. */
    markExported: z.boolean().optional()
  })
  .strict();
export type ExportSelection = z.infer<typeof ExportSelectionSchema>;

export interface ExportResult {
  items: ExportedCase[];
  markedIds: string[];
}

/**
 * Build the export for approved cases (all, or the given ids). Ids that are
 * not approved/exported are ignored. Marking moves approved -> exported; the
 * records are never deleted.
 */
export function exportCases(db: Database, selection: ExportSelection = {}, now: Date = new Date()): ExportResult {
  const statuses: CaseStatus[] = selection.includeExported || selection.ids ? EXPORTABLE : ["approved"];
  return db.transaction(() => {
    const records = db.listCases({ status: statuses, ids: selection.ids, limit: 5000 });
    const markedIds: string[] = [];
    if (selection.markExported) {
      for (const r of records) {
        if (r.status !== "approved") continue;
        db.transition(r.id, "exported", { exportedAt: now.toISOString() });
        markedIds.push(r.id);
      }
    }
    // Export reflects the data as selected; status values are refreshed after marking.
    const items = records.map((r) => toExportedCase(markedIds.includes(r.id) ? { ...r, status: "exported" } : r));
    return { items, markedIds };
  });
}
