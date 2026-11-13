export type SourceName = "hn" | "github" | "reddit";

export type CaseStatus =
  | "harvested"
  | "rejected_prefilter"
  | "classified"
  | "needs_review"
  | "duplicate"
  | "approved"
  | "rejected"
  | "exported"
  | "pushed";

export type UsecasecnCategory =
  | "生活与旅行"
  | "兴趣与娱乐"
  | "个人创作"
  | "学习与成长"
  | "工作与效率"
  | "其他";

export const USECASECN_CATEGORIES: UsecasecnCategory[] = [
  "生活与旅行",
  "兴趣与娱乐",
  "个人创作",
  "学习与成长",
  "工作与效率",
  "其他"
];

export interface CaseRecord {
  id: string;
  source: SourceName;
  sourceId: string;
  sourceUrl: string;
  projectUrl: string | null;
  canonicalKey: string | null;
  title: string;
  author: string;
  excerpt: string;
  isRealCase: boolean | null;
  confidence: number | null;
  category: UsecasecnCategory | null;
  tools: string[];
  summaryZh: string | null;
  rationale: string | null;
  status: CaseStatus;
  duplicateOfId: string | null;
  relatedSources: string[];
  reviewedAt: string | null;
  rejectReason: string | null;
  ingestReceiptId: string | null;
  ingestStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HarvestRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  perSource: Record<
    SourceName,
    {
      fetched: number;
      kept: number;
      failed: number;
      stoppedOnRateLimit: boolean;
    }
  >;
  error: string | null;
}

export interface HarvestQuery {
  since: Date;
  limit: number;
  query?: string;
}

export interface RawCandidate {
  source: SourceName;
  sourceId: string;
  sourceUrl: string;
  title: string;
  author: string;
  excerpt: string;
  discoveredUrls: string[];
  createdAt: string;
  raw: unknown;
}

export interface CollectResult {
  items: RawCandidate[];
  stoppedOnRateLimit: boolean;
  retryAfterSeconds?: number;
  fetched: number;
  failed: number;
}

export interface RequestContext {
  userAgent: string;
  delayMs: number;
}

export interface SourceCollector {
  readonly source: SourceName;
  collect(query: HarvestQuery, ctx: RequestContext): Promise<CollectResult>;
}

export interface Classification {
  isRealCase: boolean;
  confidence: number;
  category: UsecasecnCategory;
  tools: string[];
  summaryZh: string;
  rationale: string;
}

export interface LlmClient {
  completeJson(input: { system: string; user: string }): Promise<unknown>;
}
