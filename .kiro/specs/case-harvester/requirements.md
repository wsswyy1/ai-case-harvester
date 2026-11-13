# Requirements Document

## Introduction

AI Case Harvester is a Kiroween 2026 Frankenstein project: it stitches three unlike parts into one working body. Collectors read public posts from Hacker News (Algolia API), GitHub (Search API), and Reddit (public JSON) and keep only items where someone built something real with AI and left a project link. A provider-agnostic LLM classifier judges whether each item is a real case, tags domain and tools, writes a one-line Chinese summary, and deduplicates by canonical URL or repository. A Halloween-themed review dashboard lets a curator approve or reject items. Approved items can be exported as JSON or pushed into the usecasecn pending queue. Nothing the harvester submits is published automatically.

usecasecn (https://usecasecn.xyz) is a Chinese site that collects real AI use-case examples. This product helps its curator find, triage, and stage cases; it does not replace human review.

## Requirements

### Requirement 1

**User Story:** As a usecasecn curator, I want the system to harvest posts from Hacker News, GitHub, and Reddit through their public HTTP APIs, so that I can discover AI build stories without visiting each site by hand.

#### Acceptance Criteria

1. WHEN a harvest run starts THEN the system SHALL collect candidate posts from the Hacker News Algolia API, the GitHub Search API, and Reddit public JSON endpoints.
2. WHEN a harvest run starts THEN the system SHALL use only documented, unauthenticated or token-optional public read APIs and SHALL NOT log in, create accounts, vote, comment, or otherwise interact with the source sites.
3. WHEN a collector request succeeds THEN the system SHALL store the source name, source-native identifier, source URL, title, author, excerpt, discovered links, and a timestamp for each candidate.
4. IF a source is disabled in configuration THEN the system SHALL skip that source and continue the run with the remaining sources.
5. WHEN a harvest run finishes THEN the system SHALL record per-source counts for fetched, kept, skipped, and failed items.

### Requirement 2

**User Story:** As a usecasecn curator, I want only posts that describe a real thing someone built with AI and that include a project link, so that the review queue is not filled with rumors, tip lists, or model announcements.

#### Acceptance Criteria

1. WHEN a candidate has no concrete project link (repository, demo, or product URL) THEN the system SHALL exclude it from the review queue.
2. IF a discovered link is only a generic tool homepage (for example a model vendor's marketing site with no specific work attached) THEN the system SHALL NOT treat it as a project link.
3. WHEN a candidate is a model release, funding announcement, job post, prompt pack, or general opinion piece with no shipped work THEN the system SHALL mark it as not a real case and SHALL NOT place it in the review queue as a new submission.
4. WHEN a candidate describes a concrete project, workflow, or product that someone actually built or used with AI AND a project link is present THEN the system SHALL keep it for classification.

### Requirement 3

**User Story:** As a developer, I want the classifier to talk to any OpenAI-compatible LLM through environment variables, so that I can switch providers without changing application code.

#### Acceptance Criteria

1. WHEN the classifier runs THEN the system SHALL call an OpenAI-compatible chat completions endpoint configured by `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`.
2. IF `LLM_API_KEY` or `LLM_BASE_URL` is missing THEN the system SHALL fail the classification step with a clear configuration error and SHALL NOT invent a result.
3. WHEN a new OpenAI-compatible provider is configured only by changing environment variables THEN the system SHALL classify cases without requiring source-code changes.
4. WHERE classifier prompts and responses are logged the system SHALL omit the API key and SHALL redact any secret-shaped values.

### Requirement 4

**User Story:** As a usecasecn curator, I want each kept case tagged with domain and tools and summarized in one line of Chinese, so that I can triage a queue quickly.

#### Acceptance Criteria

1. WHEN the classifier accepts a candidate as a real case THEN the system SHALL assign one or more tool tags (the AI products or models used) and one domain category from the usecasecn set: 生活与旅行, 兴趣与娱乐, 个人创作, 学习与成长, 工作与效率, 其他.
2. WHEN the classifier accepts a candidate as a real case THEN the system SHALL write a single Chinese sentence summarizing what was built, who built it, and which tools were used.
3. IF the classifier cannot determine a domain with confidence THEN the system SHALL assign 其他 and record a low-confidence flag for the reviewer.
4. WHEN classification finishes THEN the system SHALL persist the verdict (real case or not), confidence, tags, Chinese summary, and a short rationale.

### Requirement 5

**User Story:** As a usecasecn curator, I want duplicates collapsed by canonical project URL or repository, so that I do not review or submit the same work twice.

#### Acceptance Criteria

1. WHEN a candidate has a GitHub (or GitLab, Gitee, Codeberg) repository link THEN the system SHALL compute a canonical repository key of the form `host/owner/repo` in lowercase, ignoring trailing `.git`, extra path segments such as `/tree/...`, and tracking parameters.
2. WHEN a candidate has a non-repository project URL THEN the system SHALL canonicalize it by lowercase host, removal of default ports, removal of trailing slashes, and removal of tracking query parameters (`utm_*`, `ref`, `fbclid`, `si`).
3. IF an incoming candidate's canonical repository key or canonical project URL already exists in the local store THEN the system SHALL mark the incoming item as a duplicate, link it to the existing record, and SHALL NOT create a second review item.
4. WHEN two source posts refer to the same canonical repository or project URL THEN the system SHALL keep the first stored record as the primary and attach later sources as related evidence.

### Requirement 6

**User Story:** As a usecasecn curator, I want harvested and classified cases saved locally, so that I can review them later even if a harvest run is interrupted.

#### Acceptance Criteria

1. WHEN a candidate is kept or classified THEN the system SHALL persist it in a local SQLite database.
2. WHEN the application starts THEN the system SHALL create any missing tables without deleting existing rows.
3. IF the database file is unavailable THEN the system SHALL return an error and SHALL NOT silently fall back to an in-memory store in production configuration.

### Requirement 7

**User Story:** As a usecasecn curator, I want a dark, Halloween-themed review dashboard, so that I can approve or reject cases quickly in the spirit of the Kiroween hackathon.

#### Acceptance Criteria

1. WHEN I open the review dashboard THEN the system SHALL show cases in `needs_review` status with title, author, source, project link, tool tags, domain category, Chinese summary, excerpt, and confidence.
2. WHEN I view the dashboard THEN the system SHALL use a dark, spooky visual theme (dark background, limited orange and purple accents) without hiding the underlying data or actions.
3. WHEN I filter by source, domain, or confidence THEN the system SHALL show only matching cases.
4. WHEN no cases are waiting for review THEN the system SHALL show an empty state that explains how to start a harvest.

### Requirement 8

**User Story:** As a usecasecn curator, I want to approve or reject each case, so that only items I have actually read can leave the queue.

#### Acceptance Criteria

1. WHEN I approve a `needs_review` case THEN the system SHALL set its status to `approved` and record the review timestamp.
2. WHEN I reject a `needs_review` case THEN the system SHALL set its status to `rejected`, accept an optional reason, and record the review timestamp.
3. IF I attempt to approve or reject a case that is not in `needs_review` THEN the system SHALL refuse the change and report the current status.
4. WHEN I approve or reject a case THEN the system SHALL NOT automatically publish it or call any usecasecn admin approval API.

### Requirement 9

**User Story:** As a usecasecn curator, I want to export approved cases as JSON, so that I can archive them or submit them through another tool.

#### Acceptance Criteria

1. WHEN I request an export of approved cases THEN the system SHALL return a JSON array of cases that I have approved and that I have selected (all approved, or a stated subset).
2. WHEN the export is generated THEN each object SHALL include title, summary, author, source URL, project URL, tools, category, evidence excerpt, and Chinese one-line summary.
3. WHEN an approved case is exported THEN the system SHALL be able to mark it as `exported` without deleting the record.

### Requirement 10

**User Story:** As a usecasecn curator, I want approved cases pushed only into the usecasecn pending queue, so that human site review remains the only path to publication.

#### Acceptance Criteria

1. WHEN I push approved cases AND `USECASECN_API_URL` and the ingest token environment variable are set THEN the system SHALL POST each case to the configured submissions endpoint as a pending submission.
2. WHEN a push request is sent THEN the system SHALL include an `Idempotency-Key` derived from the source identity and SHALL send an identifying `User-Agent`.
3. IF the ingest API returns 201 or 200 THEN the system SHALL record the receipt id and status (`pending`) and mark the local case as `pushed`.
4. IF the ingest API returns 409 THEN the system SHALL treat the case as already present, record the conflict, and SHALL NOT retry as a new item.
5. IF the ingest token or `USECASECN_API_URL` is missing THEN the system SHALL refuse to push and SHALL explain that export is still available.
6. WHERE a case is submitted the system SHALL target pending intake only and SHALL NOT call any endpoint that publishes, approves, or updates public site content.
7. IF a Reddit-sourced case has a canonical repository or project URL that the ingest schema accepts AND the documented source_url kinds do not include Reddit THEN the system SHALL use the canonical project or repository URL as `source_url` and SHALL record the Reddit thread in evidence.
8. IF a Reddit-sourced case has no ingest-compatible source URL THEN the system SHALL skip the push for that case, keep it approved, and include it only in JSON export.

### Requirement 11

**User Story:** As a developer, I want the harvester to respect rate limits and stop on HTTP 429, so that public APIs and the usecasecn intake are not abused.

#### Acceptance Criteria

1. WHEN a source or ingest API returns HTTP 429 THEN the system SHALL stop further requests to that API for the current run.
2. WHEN a 429 response includes a `Retry-After` header THEN the system SHALL record the indicated wait time in the run log and SHALL NOT immediately retry within the same run.
3. WHILE a harvest or push run is in progress the system SHALL space requests according to a configured per-source delay.
4. WHEN a run stops because of a 429 THEN the system SHALL persist all cases collected or pushed before the stop and report a partial-run result.

### Requirement 12

**User Story:** As a site operator, I want secrets kept out of source and logs, so that tokens cannot leak through the repository, the dashboard, or debug output.

#### Acceptance Criteria

1. WHERE tokens, API keys, or passwords are required the system SHALL read them only from environment variables or a local `.env` file that is gitignored.
2. IF a token or API key appears in application logs, error messages, or the review dashboard THEN the system SHALL have failed this requirement; secrets SHALL be redacted.
3. WHEN `.env.example` is committed THEN it SHALL contain only placeholder names and empty or obviously fake values, never a live credential.
4. WHEN mapping a case into the usecasecn payload THEN the system SHALL validate required fields (including a non-empty author that does not end with a hyphen) before sending the request.

### Requirement 13

**User Story:** As a source-site operator, I want this project to read public content only, so that the harvester does not evade access controls or pretend to be a logged-in user.

#### Acceptance Criteria

1. WHEN collectors run THEN the system SHALL send a descriptive User-Agent and SHALL NOT rotate User-Agents or otherwise disguise the client to bypass risk controls.
2. IF a source responds with 401, 403, or a login wall THEN the system SHALL skip that request, record the failure, and SHALL NOT attempt to authenticate unless a documented optional API token (for example a GitHub token used only to raise public search rate limits) is already configured.
3. WHEN an optional GitHub token is configured THEN the system SHALL use it only as a bearer token for official public Search API requests and SHALL NOT use it to access private repositories.
