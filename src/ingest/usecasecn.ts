import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalRepoKey } from "@/lib/dedupe";
import { UsecasecnCategorySchema, type CaseRecord } from "@/lib/types";

// ---------------------------------------------------------------------------
// Payload (usecasecn submission schema v1)
// ---------------------------------------------------------------------------

export interface UsecasecnSubmission {
  schema_version: 1;
  title: string;
  summary: string;
  author: string;
  source_url: string;
  project_url?: string;
  tools: string[];
  category: string;
  evidence: {
    original_excerpt: string;
    checked_at: string;
    limitations: string;
  };
  batch_id?: string;
  one_liner?: string;
}

/** Trim whitespace and trailing hyphens/punctuation that have caused ingest 422s. */
export function sanitizeAuthor(author: string): string {
  return author.trim().replace(/[-–—._/\\,;:!?~\s]+$/u, "").trim();
}

/**
 * `source_url` kinds the v1 intake documents. Reddit threads are not listed,
 * so they go into evidence instead.
 */
export type SourceUrlKind = "hn_item" | "github_repo";

export function sourceUrlKind(url: string | null | undefined): SourceUrlKind | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host === "news.ycombinator.com" && parsed.pathname === "/item" && /^\d+$/.test(parsed.searchParams.get("id") ?? "")) {
    return "hn_item";
  }
  const repo = canonicalRepoKey(url);
  if (repo?.startsWith("github.com/")) return "github_repo";
  return null;
}

/** Canonical form for an accepted source URL. */
function normalizeSourceUrl(url: string, kind: SourceUrlKind): string {
  if (kind === "hn_item") return `https://news.ycombinator.com/item?id=${new URL(url).searchParams.get("id")}`;
  const key = canonicalRepoKey(url)!; // github.com/owner/repo (lowercase)
  const [, owner, repo] = new URL(url).pathname.split("/");
  // Keep the original casing of owner/repo for display; strip extra paths.
  return key && owner && repo ? `https://github.com/${owner}/${repo.replace(/\.git$/i, "")}` : url;
}

export const SubmissionSchema = z.object({
  schema_version: z.literal(1),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1000),
  author: z
    .string()
    .min(1, "author is empty after sanitization")
    .refine((a) => a === a.trim(), "author has surrounding whitespace")
    .refine((a) => !/[-–—._/\\,;:!?~]$/u.test(a), "author ends with a hyphen or punctuation"),
  source_url: z.url({ protocol: /^https$/ }).refine((u) => sourceUrlKind(u) !== null, "source_url is not an accepted kind"),
  project_url: z.url({ protocol: /^https?$/ }).optional(),
  tools: z.array(z.string().trim().min(1).max(60)).min(1, "at least one tool is required").max(12),
  category: UsecasecnCategorySchema,
  evidence: z.object({
    original_excerpt: z.string().trim().min(1).max(2000),
    checked_at: z.iso.datetime({ offset: true }),
    limitations: z.string().trim().min(1).max(1000)
  }),
  batch_id: z.string().min(1).max(100).optional(),
  one_liner: z.string().trim().min(1).max(300).optional()
});

export type MapResult = { ok: true; payload: UsecasecnSubmission } | { ok: false; skip: true; reason: string };

function cleanTitle(title: string): string {
  return title.replace(/^\s*(?:show|launch|ask)\s+hn\s*[:：]\s*/i, "").trim() || title.trim();
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+\n/g, "\n").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const SOURCE_LABEL: Record<CaseRecord["source"], string> = { hn: "Hacker News", github: "GitHub", reddit: "Reddit" };

/**
 * Map a local approved case to the usecasecn v1 pending submission.
 * Reddit threads are evidence, not source_url: a Reddit case uses its GitHub
 * project link as source_url, or is skipped (and stays in JSON export).
 */
export function toUsecasecnSubmission(
  record: CaseRecord,
  options: { batchId?: string; now?: Date } = {}
): MapResult {
  if (record.status !== "approved" && record.status !== "exported") {
    return { ok: false, skip: true, reason: `Case is "${record.status}"; only approved cases can be pushed.` };
  }

  // Pick a source_url of a documented kind.
  let sourceUrl: string | null = null;
  const own = sourceUrlKind(record.sourceUrl);
  if (record.source !== "reddit" && own) {
    sourceUrl = normalizeSourceUrl(record.sourceUrl, own);
  } else {
    const projectKind = sourceUrlKind(record.projectUrl);
    if (projectKind) sourceUrl = normalizeSourceUrl(record.projectUrl!, projectKind);
  }
  if (!sourceUrl) {
    return {
      ok: false,
      skip: true,
      reason:
        record.source === "reddit"
          ? "Reddit case has no ingest-compatible source URL (HN item or GitHub repository); kept for JSON export only."
          : "Case has no ingest-compatible source URL; kept for JSON export only."
    };
  }

  const checkedAt = record.reviewedAt ?? (options.now ?? new Date()).toISOString();
  const limitations = [
    `Found via a public ${SOURCE_LABEL[record.source]} post and classified by an LLM; approved by a human curator on ${checkedAt.slice(0, 10)}.`,
    "The project was not run or independently tested by the curator.",
    record.source === "reddit" ? `Original Reddit thread: ${record.sourceUrl}` : null,
    record.lowConfidence ? "Classifier confidence was low for this case." : null
  ]
    .filter(Boolean)
    .join(" ");

  const summary = record.summaryZh?.trim() ?? "";
  const candidate = {
    schema_version: 1 as const,
    title: clip(cleanTitle(record.title), 200),
    summary,
    author: sanitizeAuthor(record.author),
    source_url: sourceUrl,
    ...(record.projectUrl ? { project_url: record.projectUrl } : {}),
    tools: record.tools,
    category: record.category ?? "",
    evidence: {
      original_excerpt: clip(record.excerpt || record.title, 2000),
      checked_at: checkedAt,
      limitations: clip(limitations, 1000)
    },
    ...(options.batchId ? { batch_id: options.batchId } : {}),
    ...(summary ? { one_liner: clip(summary, 300) } : {})
  };

  const valid = SubmissionSchema.safeParse(candidate);
  if (!valid.success) {
    const problems = valid.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { ok: false, skip: true, reason: `Payload validation failed before sending (${problems}).` };
  }
  return { ok: true, payload: valid.data as UsecasecnSubmission };
}

/** Stable per-source identity so retries never create a second submission. */
export function idempotencyKey(record: Pick<CaseRecord, "source" | "sourceId">): string {
  const digest = createHash("sha256").update(`ai-case-harvester:v1:${record.source}:${record.sourceId}`).digest("hex");
  return `ach-${digest.slice(0, 40)}`;
}
