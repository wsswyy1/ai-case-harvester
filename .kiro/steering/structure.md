---
inclusion: always
---

# Project structure

Keep new code inside the folders below. Do not invent a parallel tree.

```
src/
  app/                 Next.js App Router: pages and route handlers
    review/            Halloween review dashboard
    api/
      harvest/         POST start a harvest run
      cases/           GET list, POST /[id]/review
      export/          GET approved JSON
      push/            POST pending ingest
  collectors/          One file per source plus a barrel
  classifier/          LLM client, prompt, parser
  ingest/              usecasecn payload mapping and HTTP client
  components/          Dashboard UI pieces
  cli/                 `npm run harvest` entry
  lib/                 db, env, log, http, dedupe, types
tests/                 Vitest unit and API tests, plus fixtures/
docs/                  Demo script and human-facing notes
data/                  Local SQLite file (gitignored)
.kiro/                 Specs, steering, hooks — always committed
```

## Naming

- Files and folders: kebab-case for routes, kebab- or camel-case already used in `src/`. Collectors are named after the source: `hn.ts`, `github.ts`, `reddit.ts`.
- Types and exported functions: PascalCase for types, camelCase for functions.
- Database columns: snake_case. TypeScript fields on `CaseRecord`: camelCase, mapped at the data layer.

## Import patterns

- Import domain modules with the `@/` alias rooted at `src/`.
- Route handlers stay thin: parse input, call a function in `src/lib` or a feature folder, return JSON.
- Do not import from `src/app` into collectors, classifier, or ingest. UI and HTTP adapters depend inward, not the other way around.

## What must stay in git

The `.kiro/` directory is part of the product and the judging surface. Never add `.kiro` to `.gitignore`. Do ignore `node_modules/`, `.env`, `.next/`, `coverage/`, and `data/*.db`.

## Implementation order

Follow `.kiro/specs/case-harvester/tasks.md`. Finish persistence and collectors before the dashboard, and finish review state changes before ingest. Do not implement a publish client.
