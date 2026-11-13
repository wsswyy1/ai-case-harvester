import type { RawCandidate } from "./types";

export interface EligibleCandidate extends RawCandidate {
  /** Best concrete project link: repository first, then demo or product URL. */
  projectUrl: string;
  projectUrlKind: "repository" | "project";
}

export type PrefilterReason =
  | "no_project_link"
  | "job_post"
  | "funding_announcement"
  | "model_announcement"
  | "prompt_pack"
  | "discussion_question";

export type EligibilityResult =
  | { ok: true; candidate: EligibleCandidate }
  | { ok: false; reason: PrefilterReason; detail: string };

// ---------------------------------------------------------------------------
// Project link classification
// ---------------------------------------------------------------------------

/** Git hosts where `/owner/repo` identifies a repository. */
export const REPO_HOSTS = new Set(["github.com", "gitlab.com", "gitee.com", "codeberg.org", "bitbucket.org"]);

/** First path segments on GitHub that are product pages, not users. */
const GITHUB_RESERVED = new Set([
  "about", "apps", "blog", "collections", "contact", "customer-stories", "enterprise", "events",
  "explore", "features", "issues", "login", "marketplace", "new", "notifications", "orgs", "pricing",
  "pulls", "search", "security", "settings", "signup", "site", "sponsors", "team", "topics", "trending"
]);

/**
 * Model and AI tool vendors. Their pages count as project links only when the
 * path matches a known per-project pattern (a Space, a custom GPT, ...).
 */
const VENDOR_HOSTS = [
  "openai.com", "chatgpt.com", "anthropic.com", "claude.ai", "claude.com", "google.com", "deepmind.google",
  "ai.google.dev", "gemini.google.com", "microsoft.com", "meta.ai", "llama.com", "mistral.ai", "x.ai",
  "perplexity.ai", "cohere.com", "deepseek.com", "qwenlm.github.io", "huggingface.co", "replicate.com",
  "together.ai", "groq.com", "ollama.com", "cursor.com", "kiro.dev", "aws.amazon.com", "amazon.com",
  "nvidia.com", "apple.com", "midjourney.com", "stability.ai", "runwayml.com", "elevenlabs.io",
  "github.com", "copilot.microsoft.com", "notion.so", "vercel.com", "v0.dev", "lovable.dev", "bolt.new",
  "replit.com"
];

/** Vendor paths that do identify a specific piece of work. */
const VENDOR_PROJECT_PATHS: { host: string; pattern: RegExp }[] = [
  { host: "huggingface.co", pattern: /^\/spaces\/[^/]+\/[^/]+/ },
  { host: "huggingface.co", pattern: /^\/(?!docs|blog|pricing|models$|datasets$|spaces$|papers|learn|tasks|enterprise|join|login)[^/]+\/[^/]+/ },
  { host: "chatgpt.com", pattern: /^\/g\/g-[A-Za-z0-9]+/ },
  { host: "replit.com", pattern: /^\/@[^/]+\/[^/]+/ },
  { host: "v0.dev", pattern: /^\/chat\/[^/]+/ },
  { host: "ollama.com", pattern: /^\/(?!library$|search|blog|download|docs)[^/]+\/[^/]+/ }
];

/** Hosts that are never the project itself: discussions, social, media, papers, consoles. */
const NON_PROJECT_HOSTS = [
  "news.ycombinator.com", "reddit.com", "redd.it", "x.com", "twitter.com", "t.co", "youtube.com", "youtu.be",
  "linkedin.com", "facebook.com", "instagram.com", "tiktok.com", "discord.gg", "discord.com", "t.me",
  "imgur.com", "medium.com", "substack.com", "arxiv.org", "doi.org", "wikipedia.org", "bit.ly",
  "console.cloud.google.com", "console.aws.amazon.com", "portal.azure.com", "platform.openai.com",
  "console.anthropic.com", "web.archive.org", "archive.org", "archive.ph", "bsky.app", "mastodon.social",
  "threads.net", "producthunt.com"
];

function hostMatches(host: string, list: readonly string[]): string | undefined {
  return list.find((d) => host === d || host.endsWith(`.${d}`));
}

function normalizedHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

/** True when `url` points at a repository (`host/owner/repo`) on a known git host. */
export function isRepositoryUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = normalizedHost(url);
  if (!REPO_HOSTS.has(host)) return false;
  const [owner, repo] = pathSegments(url);
  if (!owner || !repo) return false;
  if (host === "github.com" && GITHUB_RESERVED.has(owner.toLowerCase())) return false;
  return true;
}

export type LinkKind = "repository" | "project" | "generic" | "non_project" | "invalid";

/** Classify a single discovered URL. */
export function classifyLink(raw: string): LinkKind {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "invalid";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "invalid";
  const host = normalizedHost(url);
  if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host) || !host.includes(".")) return "invalid";
  if (isRepositoryUrl(raw)) return "repository";
  if (host === "gist.github.com" && pathSegments(url).length >= 2) return "project";
  if (hostMatches(host, NON_PROJECT_HOSTS)) return "non_project";

  const vendor = hostMatches(host, VENDOR_HOSTS);
  if (vendor) {
    const pathname = url.pathname;
    const isProjectPath = VENDOR_PROJECT_PATHS.some(
      (p) => (host === p.host || host.endsWith(`.${p.host}`)) && p.pattern.test(pathname)
    );
    return isProjectPath ? "project" : "generic";
  }

  // A documentation root with no project ("docs.example.com/") is generic.
  if (/^docs?\./.test(host) && pathSegments(url).length === 0) return "generic";
  return "project";
}

/** Pick the best project link: first repository, else first project URL. */
export function selectProjectUrl(urls: readonly string[]): { url: string; kind: "repository" | "project" } | null {
  let firstProject: string | null = null;
  for (const u of urls) {
    const kind = classifyLink(u);
    if (kind === "repository") return { url: u, kind };
    if (kind === "project" && firstProject === null) firstProject = u;
  }
  return firstProject ? { url: firstProject, kind: "project" } : null;
}

// ---------------------------------------------------------------------------
// Cheap non-case heuristics (run before the LLM)
// ---------------------------------------------------------------------------

/** First-person "I/we built this" signals. They veto the softer heuristics. */
const BUILD_SIGNAL =
  /\b(show hn|launch hn|i (?:just )?(?:built|made|created|wrote|shipped|developed|hacked)|we (?:just )?(?:built|made|created|shipped|developed)|my (?:new |weekend |side )?(?:app|tool|project|side project|extension|bot|library|cli)|built (?:with|using|on)|made (?:with|using))\b/i;

const RULES: { reason: PrefilterReason; test: (title: string, text: string) => boolean; soft: boolean }[] = [
  {
    reason: "job_post",
    soft: false,
    test: (title) =>
      /(\[hiring\]|\bwe(?:'re| are) hiring\b|\bis hiring\b|\bwho is hiring\b|\bhiring:|\bjob (?:opening|posting|offer)\b|\blooking for (?:a |an )?(?:technical )?(?:co-?founder|cto)\b|\b(?:seeking|looking for) (?:a |an )?(?:senior |junior )?(?:engineer|developer)s?\b)/i.test(
        title
      )
  },
  {
    reason: "funding_announcement",
    soft: true,
    test: (title) =>
      /\b(raises?|raised|secures?|closes?)\s+(?:a\s+)?\$?\d+(?:\.\d+)?\s*(?:m|mm|million|b|bn|billion)\b|\bseries [a-e] (?:round|funding)\b|\bseed (?:round|funding)\b/i.test(
        title
      )
  },
  {
    reason: "model_announcement",
    soft: true,
    test: (title) =>
      /\b(introducing|announcing|announces?|announced|releases?|released|unveils?|unveiled|launches|launched|now available)\b/i.test(
        title
      ) &&
      /\b(model|weights|checkpoint|gpt-?\d|o\d\b|llama|gemini|claude|mistral|qwen|deepseek|grok|phi-?\d|sonnet|opus|haiku)\b/i.test(
        title
      )
  },
  {
    reason: "prompt_pack",
    soft: true,
    test: (title, text) =>
      /\b(prompt (?:pack|library|collection|list|templates?|cheat ?sheet)|\d+\+?\s+(?:best |useful |powerful )?(?:chatgpt |gpt |ai |llm )?prompts\b|cheat ?sheet|(?:^|[\s/])awesome-[\w-]+)\b/i.test(
        title
      ) || /^\s*(?:here are )?\d+\+?\s+(?:chatgpt |ai )?prompts\b/i.test(text)
  },
  {
    reason: "discussion_question",
    soft: true,
    test: (title) =>
      /\?\s*$/.test(title) &&
      /^(?:\[?(?:question|discussion|q)\]?\s*:?\s*)?(?:what|which|how|why|is|are|does|do|should|anyone|has anyone|can|could|would|who)\b/i.test(
        title.trim()
      )
  }
];

export function prefilter(raw: Pick<RawCandidate, "title" | "excerpt">): { reason: PrefilterReason; detail: string } | null {
  const title = raw.title ?? "";
  const text = raw.excerpt ?? "";
  const hasBuildSignal = BUILD_SIGNAL.test(title) || BUILD_SIGNAL.test(text.slice(0, 400));
  for (const rule of RULES) {
    if (rule.soft && hasBuildSignal) continue;
    if (rule.test(title, text)) {
      return { reason: rule.reason, detail: `Pre-filter: looks like a ${rule.reason.replace(/_/g, " ")}.` };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Normalize a raw candidate and decide whether it may reach the classifier.
 * Requirement 2: a concrete project link is mandatory; generic vendor pages
 * do not count; obvious non-cases are dropped before the LLM.
 */
export function evaluateEligibility(raw: RawCandidate): EligibilityResult {
  const filtered = prefilter(raw);
  if (filtered) return { ok: false, ...filtered };

  const project = selectProjectUrl(raw.discoveredUrls);
  if (!project) {
    return {
      ok: false,
      reason: "no_project_link",
      detail:
        raw.discoveredUrls.length === 0
          ? "No link found in the post."
          : "Only generic, social, or discussion links were found; no concrete project link."
    };
  }
  return {
    ok: true,
    candidate: { ...raw, projectUrl: project.url, projectUrlKind: project.kind }
  };
}

/** Convenience wrapper: the eligible candidate, or null when it was filtered out. */
export function selectEligible(raw: RawCandidate): EligibleCandidate | null {
  const result = evaluateEligibility(raw);
  return result.ok ? result.candidate : null;
}
