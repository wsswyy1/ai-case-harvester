---
inclusion: always
---

# usecasecn inclusion rules

These rules apply to classification, review, export, and ingest. They are product rules, not style preferences.

## A case must be real

Include only a concrete project, workflow, or product that someone actually built or used with AI.

Do not include:

- Model, paper, or funding announcements with no shipped work
- Job posts, hiring threads, or "looking for a cofounder" messages
- Generic prompt packs, cheat sheets, or "what's your favorite model" discussions
- Rumors, leaks, or unverified claims with no artifact
- Marketing pages for a general-purpose tool with no specific use attached

When unsure, classify as not a real case or flag low confidence and leave the decision to the curator. Do not stretch a maybe into a yes.

## A case must have a project link

Every item that enters the review queue needs a concrete project URL: a repository, a demo, or a product page for that work.

Generic tool homepages (a model vendor's root marketing site, a cloud console login, a documentation root with no project) are not project links. If the only URL is generic, drop the item before review.

## Deduplicate by link or repository

Identity is the canonical repository (`host/owner/repo`, lowercase, no `.git` or tree path) or the canonical project URL (no tracking parameters, no trailing slash). Two posts about the same repo are one case. Attach later posts as related sources on the primary record. Never open a second review card, and never POST a second pending submission, for the same canonical key.

## Submissions go to pending only

Approved cases may be exported as JSON or POSTed to the usecasecn submissions endpoint. The harvester's job ends when the receipt status is `pending` (or a recorded duplicate/conflict).

Never call an admin, publish, or approve API. Never treat a local "Approve" click as publication on usecasecn. Site operators review the pending queue themselves.

## Payload hygiene

Map to usecasecn submission schema version 1. Required fields include `title`, `summary`, `author`, `source_url`, `tools`, `category`, and `evidence` (`original_excerpt`, `checked_at`, `limitations`).

- `category` must be one of: 生活与旅行, 兴趣与娱乐, 个人创作, 学习与成长, 工作与效率, 其他.
- `author` must be non-empty after trim and must not end with a hyphen or similar trailing punctuation (this has caused 422 rejections).
- `source_url` must be a documented accepted kind when pushing (HN item, GitHub repository, and other kinds the official schema lists). Reddit thread URLs stay in evidence when they are not an accepted `source_url` kind. If there is no compatible source URL, skip the push and leave the case in the JSON export.
- Send an `Idempotency-Key` derived from the source identity. Respect 409 as "already present."
- Stop the push batch on HTTP 429. Do not retry 429 in the same run.

## Secrets and manners

Read `USECASECN_INGEST_TOKEN` only from the environment. Never put it in source, prompts, query strings, logs, fixtures, or the dashboard. Identify the client with a stable User-Agent. Do not bypass risk controls.
