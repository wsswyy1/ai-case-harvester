---
inclusion: always
---

# Product

AI Case Harvester is a Kiroween 2026 entry in the **Frankenstein** category. It stitches three unlike organs into one body:

1. Public-source collectors (Hacker News Algolia, GitHub Search API, Reddit public JSON).
2. A provider-agnostic LLM classifier that judges real cases, tags them, writes a one-line Chinese summary, and dedupes by canonical URL or repository.
3. A Halloween-themed review dashboard. Approved items are exported as JSON or pushed to the usecasecn **pending** queue.

## Why it exists

[usecasecn](https://usecasecn.xyz) is a Chinese site that collects real AI use-case examples — things people actually built, not rumors or tool announcements. Finding those examples by hand across HN, GitHub, and Reddit is slow. This product is a curator assistant, not an autopilot publisher.

## Users

The primary user is the usecasecn curator. Judges of Kiroween are a secondary audience: the demo must make the three-part stitch, the Kiro workflow (specs, steering, hooks), and the human review step obvious in about three minutes.

## Product principles

- **Real cases only.** A case is a concrete project, workflow, or product someone built or used with AI, with a project link.
- **Human review is mandatory.** The classifier ranks and drafts; the curator approves or rejects.
- **Pending only.** Submissions never publish themselves. usecasecn site review remains the only path to a public page.
- **Public read, polite client.** Collectors use documented public APIs, identify themselves, respect rate limits, and stop on HTTP 429.
- **Secrets stay out of the repo and the logs.** Tokens come from environment variables. They are never hardcoded, printed, or shown in the dashboard.
- **Halloween is the skin, not the data model.** Status values stay `needs_review`, `approved`, `rejected`. The theme must not hide information.

## Success for the hackathon

A judge can watch a harvest of fixture or live public data, see a classified case with a Chinese one-liner, approve it in the graveyard queue, and export or push it as a pending submission. The `.kiro/` directory is part of the deliverable and must stay in git.
