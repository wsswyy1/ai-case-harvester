---
inclusion: always
---

# Technology stack

## Chosen stack

TypeScript, Next.js App Router, SQLite (`better-sqlite3`), Tailwind CSS, Zod, and Vitest.

This is a single-process app on purpose. Collectors, classifier client, review UI, and ingest client share one domain layer and one `npm run dev`. SQLite is enough for a curator's local queue. Do not introduce a second language, a message broker, or a hosted database unless a later requirement forces it.

## Conventions

- Target a current Node.js LTS and official Next.js App Router TypeScript style.
- Prefer the built-in `fetch` for HTTP. No headless browser, no HTML scraping of login-gated pages.
- Validate env, LLM output, and ingest payloads with Zod.
- Keep modules side-effect light: orchestration functions should be callable from a route handler and from the CLI.
- Tests run with Vitest. Network and live LLM calls are faked. Collector tests use recorded JSON fixtures under `tests/fixtures/`.
- Logging goes through `src/lib/log.ts`. That helper must redact bearer tokens, `sk-` prefixes, and values of secret environment variables.

## Environment

| Variable | Secret | Purpose |
| --- | --- | --- |
| `LLM_BASE_URL` | no | OpenAI-compatible base URL |
| `LLM_API_KEY` | yes | Provider key |
| `LLM_MODEL` | no | Model name |
| `GITHUB_TOKEN` | yes | Optional, public Search API rate limit only |
| `USECASECN_API_URL` | no | Pending submissions base URL |
| `USECASECN_INGEST_TOKEN` | yes | Ingest bearer token |
| `DATABASE_PATH` | no | SQLite file path, default `./data/harvester.db` |

Never write secret values into source, commit them, put them in URLs, or echo them in logs, tests, or the UI. `.env` is gitignored. `.env.example` holds names only.

## HTTP manners

- Send a stable, descriptive User-Agent (`ai-case-harvester/0.1`).
- Do not rotate User-Agents or otherwise disguise the client.
- Honor per-source delays. On HTTP 429, stop calls to that API for the rest of the run and record `Retry-After`.
- An optional GitHub token may only be used against the official public Search API, never to read private repositories.

## Prefer these libraries when adding code

- `better-sqlite3` for persistence
- `zod` for parsing
- `vitest` for tests
- Tailwind utility classes for the dashboard theme

Do not add Playwright, Puppeteer, an ORM with a separate service, or an analytics SDK in v1.
