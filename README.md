# AI Case Harvester

A [Kiroween 2026](https://kiro.dev) **Frankenstein** project: three unlike parts stitched into one curator tool for [usecasecn](https://usecasecn.xyz), a Chinese site that collects real AI use-case examples.

1. **Collectors** read public posts from Hacker News (Algolia API), GitHub (Search API), and Reddit (public JSON), and keep items where someone built something real with AI and left a project link.
2. **Classifier** talks to any OpenAI-compatible LLM, judges real-case vs not, tags domain and tools, writes a one-line Chinese summary, and dedupes by canonical URL or repository.
3. **Review dashboard** is a dark, Halloween-themed queue. You approve or reject. Approved cases export as JSON, or can be pushed to the usecasecn **pending** queue. Nothing is published automatically.

All tasks in `.kiro/specs/case-harvester/tasks.md` are implemented.

## Short brief (中文)

这是给 usecasecn 用的「AI 案例收割机」，Kiroween 2026 的 Frankenstein 作品。它从 HN、GitHub、Reddit 的公开接口抓「有人用 AI 做出了东西、并且带项目链接」的帖子，交给大模型判断真伪、打上领域和工具标签、写一句中文摘要，再按仓库或链接去重。你在暗黑万圣节风格的审核台里通过或拒绝；通过的案例可以导出 JSON，或用环境变量推到 usecasecn 的待审队列，不会自动上线。令牌只放在本地 `.env`，不要写进代码或日志。用 Kiro 打开本目录，按 `.kiro/specs/case-harvester/tasks.md` 逐项实现即可。先在已安装的 Kiro 里确认 `.kiro/hooks/` 的 JSON 格式。

## Requirements

- Node.js LTS
- An OpenAI-compatible LLM endpoint (for classification)
- Optional: a GitHub token, used only to raise public Search API rate limits
- Optional: usecasecn pending-intake URL and token, only if you want to push

## Setup

Stack: Next.js 16 (App Router), React 19, Tailwind CSS 4, SQLite via `better-sqlite3`, Zod 4, Vitest. Node.js 20.9 or later.

```bash
cp .env.example .env
# fill LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
npm install
npm run dev
```

Open [http://localhost:3000/review](http://localhost:3000/review). Start a harvest from the dashboard, or run:

```bash
npm run harvest -- --sources hn,github --since-hours 72 --limit 15
npm test          # no live network; fetch is stubbed in tests
npm run typecheck
npm run lint
```

Without `LLM_*` set, harvested posts are stored as `harvested` and the run is reported as partial; they reach the review queue only after classification.

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/harvest` | `{ sources?, since? \| sinceHours?, limit?, query? }` → run summary |
| `GET` | `/api/cases?status=&source=&category=&minConfidence=` | List cases (`status` may be comma-separated) |
| `POST` | `/api/cases/:id/review` | `{ "decision": "approved" \| "rejected", "reason"?: string }`, `needs_review` only |
| `GET` | `/api/export?status=approved[&ids=a,b][&download=1]` | JSON array of approved cases (read-only) |
| `POST` | `/api/export` | `{ ids?, includeExported?, markExported? }`; can mark cases `exported` |
| `POST` | `/api/push` | `{ ids?, batchId? }`; sends approved cases to `{USECASECN_API_URL}/submissions` (pending only) |

## Known limits

- Reddit's anonymous `.json` listings may answer 403 from some networks. The collector records this as a failure and the run continues; it never logs in. The Reddit test fixture is synthetic for this reason (see `tests/fixtures/README.md`).
- The accepted `source_url` kinds for usecasecn are taken from the steering rules (HN item, GitHub repository). If the official schema lists more kinds, extend `sourceUrlKind` in `src/ingest/usecasecn.ts`.
- Mutating routes have no auth. Run the app on loopback only.

Do not commit `.env`. Tokens must never appear in source, logs, or the dashboard.

## Environment

See `.env.example`. Secret variables:

- `LLM_API_KEY` — provider key for the classifier
- `GITHUB_TOKEN` — optional, public search only
- `USECASECN_INGEST_TOKEN` — pending-intake bearer token; the app reads it only from the environment

`USECASECN_API_URL` is the base URL of the pending submissions API, not the public marketing site.

## What this tool will not do

- Log in to HN, GitHub, or Reddit, or bypass their risk controls
- Publish, approve, or update public pages on usecasecn
- Retry past an HTTP 429 in the same run
- Store an in-memory database as a silent fallback when the SQLite file cannot be opened

## Demo video

Placeholder: add a public YouTube or Vimeo link here before the Devpost submission (about 3 minutes).

A shot-by-shot outline lives in [`docs/demo-script.md`](docs/demo-script.md).

## How Kiro was used

Placeholder — fill this in as you implement, and keep it honest for the judges.

This repository started as a hand-written Kiro-style spec and skeleton (requirements, design, tasks, steering, and example hooks) so work could begin before the IDE was installed.

Progress so far: Kiro (web, Vibe mode) implemented tasks 1–13 from `.kiro/specs/case-harvester/tasks.md` in order, with one commit per task or sub-task, following the steering files (`tech.md`, `structure.md`, `usecasecn-rules.md`). One design deviation: deduplication runs before classification so duplicates never cost an LLM call. The hook JSON files were not exercised in that session.

Still to record after opening the project in the Kiro IDE:

- How the `.kiro/specs/case-harvester/` documents were reviewed or regenerated
- Which steering files (especially `usecasecn-rules.md`) guided classification and ingest
- Which hooks ran (tests on save, README updates on spec change, secret scan on stop)
- How you used specs, hooks, and steering — and conversations with the model — while building the three stitched parts
- Anything the hooks format required after confirmation in the installed Kiro

Do not invent usage that did not happen. The `.kiro/` directory is part of the submission and must remain in git (it is not gitignored).

## License

MIT © SHANG WU 2026. See [LICENSE](LICENSE).
