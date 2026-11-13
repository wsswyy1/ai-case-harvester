# AI Case Harvester

A [Kiroween 2026](https://kiro.dev) **Frankenstein** project: three unlike parts stitched into one curator tool for [usecasecn](https://usecasecn.xyz), a Chinese site that collects real AI use-case examples.

1. **Collectors** read public posts from Hacker News (Algolia API), GitHub (Search API), and Reddit (public JSON), and keep items where someone built something real with AI and left a project link.
2. **Classifier** talks to any OpenAI-compatible LLM, judges real-case vs not, tags domain and tools, writes a one-line Chinese summary, and dedupes by canonical URL or repository.
3. **Review dashboard** is a dark, Halloween-themed queue. You approve or reject. Approved cases export as JSON, or can be pushed to the usecasecn **pending** queue. Nothing is published automatically.

This repository is a specification-first skeleton. Implementation follows `.kiro/specs/case-harvester/tasks.md`.

## Short brief (中文)

这是给 usecasecn 用的「AI 案例收割机」，Kiroween 2026 的 Frankenstein 作品。它从 HN、GitHub、Reddit 的公开接口抓「有人用 AI 做出了东西、并且带项目链接」的帖子，交给大模型判断真伪、打上领域和工具标签、写一句中文摘要，再按仓库或链接去重。你在暗黑万圣节风格的审核台里通过或拒绝；通过的案例可以导出 JSON，或用环境变量推到 usecasecn 的待审队列，不会自动上线。令牌只放在本地 `.env`，不要写进代码或日志。用 Kiro 打开本目录，按 `.kiro/specs/case-harvester/tasks.md` 逐项实现即可。先在已安装的 Kiro 里确认 `.kiro/hooks/` 的 JSON 格式。

## Requirements

- Node.js LTS
- An OpenAI-compatible LLM endpoint (for classification)
- Optional: a GitHub token, used only to raise public Search API rate limits
- Optional: usecasecn pending-intake URL and token, only if you want to push

## Setup

This tree is a spec-first skeleton: types and route stubs are in place, but dependencies are not pinned yet. Open the folder in Kiro, confirm the hook files load (see `.kiro/hooks/README.md`), then run task 1 in `.kiro/specs/case-harvester/tasks.md` to scaffold Next.js, Tailwind, Vitest, and SQLite. After that:

```bash
cp .env.example .env
# fill LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
npm install
npm run dev
```

Open [http://localhost:3000/review](http://localhost:3000/review). Start a harvest from the dashboard, or run:

```bash
npm run harvest
npm test
```

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

This repository started as a hand-written Kiro-style spec and skeleton (requirements, design, tasks, steering, and example hooks) so work could begin before the IDE was installed. After opening the project in Kiro, record:

- How the `.kiro/specs/case-harvester/` documents were reviewed or regenerated
- Which steering files (especially `usecasecn-rules.md`) guided classification and ingest
- Which hooks ran (tests on save, README updates on spec change, secret scan on stop)
- How you used specs, hooks, and steering — and conversations with the model — while building the three stitched parts
- Anything the hooks format required after confirmation in the installed Kiro

Do not invent usage that did not happen. The `.kiro/` directory is part of the submission and must remain in git (it is not gitignored).

## License

MIT © SHANG WU 2026. See [LICENSE](LICENSE).
