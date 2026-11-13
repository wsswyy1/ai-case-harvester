# Implementation Plan

- [x] 1. Scaffold the Next.js TypeScript app and shared foundations
  - Initialize the App Router project, Tailwind, Vitest, Zod, and `better-sqlite3`
  - Add `tsconfig`, lint, `.env.example`, and a gitignore that excludes `.env` and `data/*.db` but does **not** exclude `.kiro`
  - Implement `src/lib/env.ts` to read and validate environment variables without logging secret values
  - Implement a logging helper that redacts tokens and known secret env values
  - _Requirements: 3.1, 3.4, 12.1, 12.2, 12.3_

- [x] 2. Persist cases and harvest runs in SQLite
- [x] 2.1 Define TypeScript types and Zod schemas for `CaseRecord`, `HarvestRun`, categories, and statuses
  - Encode usecasecn category enums and status transitions in the schema
  - _Requirements: 4.1, 4.4, 6.1_
- [x] 2.2 Create the SQLite schema and migration runner
  - Open the file at `DATABASE_PATH`, apply ordered migrations, refuse an in-memory fallback in production
  - Add unique indexes on `(source, source_id)` and on non-duplicate `canonical_key`
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 3. Build the HTTP client and rate-limit stop rule
  - Wrap `fetch` with a descriptive User-Agent, per-source delay, and 429 handling that records `Retry-After` and stops further calls to that API in the current run
  - Do not rotate User-Agents; do not retry a 429 inside the same run
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 13.1, 13.2_

- [x] 4. Implement public-source collectors
- [x] 4.1 Define the `SourceCollector` interface and shared `RawCandidate` type
  - _Requirements: 1.3_
- [x] 4.2 Implement the Hacker News Algolia collector with fixture tests
  - _Requirements: 1.1, 1.2, 1.3, 1.5_
- [x] 4.3 Implement the GitHub Search API collector with fixture tests
  - Use `GITHUB_TOKEN` only when present, and only for official public search
  - _Requirements: 1.1, 1.2, 1.3, 13.2, 13.3_
- [x] 4.4 Implement the Reddit public JSON collector with fixture tests
  - Limit to a configured list of public subreddits; no login flow
  - _Requirements: 1.1, 1.2, 1.3, 13.1_
- [x] 4.5 Wire source enablement and per-source run counts
  - Skip disabled sources; tally fetched, kept, skipped, and failed
  - _Requirements: 1.4, 1.5_

- [x] 5. Normalize candidates and enforce eligibility
  - Extract a project URL, reject generic vendor homepages, and drop items with no concrete project link
  - Apply cheap heuristics for job posts, model-announcement threads, and prompt packs before calling the LLM
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 6. Canonicalize URLs and deduplicate by repo or project link
  - Implement repository and URL canonicalization with unit tests
  - Link incoming duplicates to the primary record and attach related sources
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7. Implement the provider-agnostic classifier
- [x] 7.1 Add the `LlmClient` interface and an OpenAI-compatible implementation
  - Read `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`; fail clearly when they are missing
  - _Requirements: 3.1, 3.2, 3.3, 3.4_
- [x] 7.2 Build the classification prompt and JSON parser
  - Map verdict, confidence, official usecasecn category, tool tags, Chinese one-liner, and rationale
  - Default uncertain domains to 其他 with a low-confidence flag
  - Leave a candidate in `harvested` when the model returns invalid JSON
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 8. Orchestrate a harvest run
  - Sequence collect → normalize → classify → dedupe → persist
  - Continue past per-item LLM failures; stop a source or the push target on 429; persist a partial result
  - Expose the same function from `POST /api/harvest` and `npm run harvest`
  - _Requirements: 1.5, 6.1, 11.1, 11.4_

- [x] 9. Expose case listing and review APIs
  - `GET /api/cases` with status, source, and category filters
  - `POST /api/cases/:id/review` approves or rejects only `needs_review` items, records timestamp and optional reason, and never calls a publish API
  - _Requirements: 7.1, 7.3, 8.1, 8.2, 8.3, 8.4_

- [x] 10. Build the Halloween review dashboard
  - Render the `needs_review` queue with title, author, source, project link, tags, category, Chinese summary, excerpt, and confidence
  - Apply a dark, spooky theme that does not hide data or actions
  - Add filters and an empty state that explains how to start a harvest
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 11. Export approved cases as JSON
  - `GET /api/export` returns the mapped objects and can mark exported cases without deleting them
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 12. Push approved cases to the usecasecn pending endpoint
- [x] 12.1 Map a local case to the usecasecn v1 submission payload
  - Sanitize author (trim, no trailing hyphen); validate required fields before send
  - For Reddit-sourced cases, prefer an ingest-compatible project or repo URL as `source_url` and keep the thread in evidence; skip push when no compatible URL exists
  - _Requirements: 10.7, 10.8, 12.4_
- [x] 12.2 Implement the ingest client
  - Read `USECASECN_API_URL` and `USECASECN_INGEST_TOKEN`; refuse to push when either is missing
  - Send bearer auth, idempotency key, and User-Agent; never log the token
  - Handle 201/200, 409, 422, and 429 as specified; pending intake only
  - Wire `POST /api/push`
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 11.1, 12.2_

- [x] 13. Add redaction, mapping, and state-machine tests
  - Cover log redaction, author sanitization, payload mapping, review transitions, and 429 stop behavior with no live network
  - _Requirements: 8.3, 11.1, 12.2, 12.4_
