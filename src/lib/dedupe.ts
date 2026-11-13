import type { Database } from "./db";
import type { CaseRecord } from "./types";

/**
 * Canonical repository and URL keys used for deduplication.
 * See Requirement 5.
 */

/** Git hosts where `/owner/repo` identifies a repository. */
export const CANONICAL_REPO_HOSTS = new Set(["github.com", "gitlab.com", "gitee.com", "codeberg.org", "bitbucket.org"]);

/** Query parameters that never change what a page is. */
const TRACKING_PARAMS = new Set(["ref", "ref_src", "fbclid", "gclid", "si", "mc_cid", "mc_eid"]);

function isTrackingParam(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith("utm_") || TRACKING_PARAMS.has(n);
}

/** First path segments on GitHub that are product pages, not users or orgs. */
const GITHUB_RESERVED = new Set([
  "about", "apps", "blog", "collections", "contact", "customer-stories", "enterprise", "events",
  "explore", "features", "issues", "login", "marketplace", "new", "notifications", "orgs", "pricing",
  "pulls", "search", "security", "settings", "signup", "site", "sponsors", "team", "topics", "trending"
]);

function parse(raw: string): URL | null {
  const trimmed = raw.trim();
  // git@github.com:owner/repo.git
  const ssh = /^git@([^:]+):(.+)$/.exec(trimmed);
  try {
    return new URL(ssh ? `https://${ssh[1]}/${ssh[2]}` : trimmed);
  } catch {
    return null;
  }
}

/**
 * `host/owner/repo` in lowercase for GitHub, GitLab, Gitee, Codeberg, and
 * Bitbucket. Strips `.git`, extra path segments (`/tree/...`, `/blob/...`,
 * `/issues/...`), query, and fragment. Returns null for non-repo URLs.
 *
 * GitLab subgroups (`group/sub/project`) are not modeled: the key is the first
 * two segments, which can merge sibling projects in a subgroup. That trade-off
 * keeps `/-/tree/...` style paths safe.
 */
export function canonicalRepoKey(url: string): string | null {
  const parsed = parse(url);
  if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!CANONICAL_REPO_HOSTS.has(host)) return null;
  const segments = parsed.pathname.split("/").filter(Boolean);
  const owner = segments[0];
  const repo = segments[1]?.replace(/\.git$/i, "");
  if (!owner || !repo || repo === "-") return null;
  if (host === "github.com" && GITHUB_RESERVED.has(owner.toLowerCase())) return null;
  return `${host}/${owner}/${repo}`.toLowerCase();
}

/**
 * Canonical project URL: https scheme kept as given, lowercase host, default
 * port removed, trailing slash removed, tracking parameters (`utm_*`, `ref`,
 * `fbclid`, `si`, ...) removed, remaining parameters sorted, fragment dropped.
 */
export function canonicalProjectUrl(url: string): string | null {
  const parsed = parse(url);
  if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) return null;
  if (!parsed.hostname) return null;

  const host = parsed.hostname.toLowerCase();
  const defaultPort = (parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80");
  const port = parsed.port && !defaultPort ? `:${parsed.port}` : "";

  const kept = [...parsed.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = kept.length ? `?${new URLSearchParams(kept).toString()}` : "";

  let path = parsed.pathname.replace(/\/{2,}/g, "/");
  path = path.replace(/\/+$/, "");

  return `${parsed.protocol}//${host}${port}${path}${query}`;
}

/**
 * Dedupe identity for a project link. Repositories use `host/owner/repo`;
 * other URLs use the canonical URL without scheme or `www.` so http/https and
 * www/apex variants collapse.
 */
export function canonicalKeyFor(projectUrl: string | null): string | null {
  if (!projectUrl) return null;
  const repo = canonicalRepoKey(projectUrl);
  if (repo) return repo;
  const canonical = canonicalProjectUrl(projectUrl);
  if (!canonical) return null;
  return canonical.replace(/^https?:\/\//, "").replace(/^www\./, "");
}

export interface DuplicateMatch {
  primary: CaseRecord;
}

/** Existing primary record for this canonical key, if any (excluding the record itself). */
export function findPrimary(
  db: Pick<Database, "findByCanonicalKey">,
  canonicalKey: string | null,
  selfId?: string
): CaseRecord | undefined {
  if (!canonicalKey) return undefined;
  const primary = db.findByCanonicalKey(canonicalKey);
  return primary && primary.id !== selfId ? primary : undefined;
}

/**
 * Turn `incoming` into a duplicate of `primary` and attach its source URL to
 * the primary's related sources. The first stored record stays primary.
 * Caller persists the returned record.
 */
export function linkDuplicate(
  db: Pick<Database, "appendRelatedSource">,
  primary: CaseRecord,
  incoming: CaseRecord
): CaseRecord {
  db.appendRelatedSource(primary.id, incoming.sourceUrl);
  return {
    ...incoming,
    status: "duplicate",
    duplicateOfId: primary.id,
    note: `Duplicate of ${primary.id} (${incoming.canonicalKey ?? "same project"}).`,
    updatedAt: new Date().toISOString()
  };
}
