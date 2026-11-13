Recorded JSON responses for collector tests go here (HN Algolia, GitHub Search, Reddit listings). Do not include API tokens or personal data beyond what the public endpoints already return.

| File | Origin |
| --- | --- |
| `hn-search-by-date.json` | Recorded from `hn.algolia.com/api/v1/search_by_date?query=LLM&tags=show_hn` on 2026-11-13, trimmed to 8 hits (highlight fields removed). |
| `github-search-repositories.json` | Recorded from the unauthenticated `api.github.com/search/repositories` endpoint on 2026-11-13, trimmed to 6 public repositories and a subset of fields. |
| `reddit-new.json` | **Synthetic.** Reddit's public `/r/{sub}/new.json` returned HTTP 403 to the anonymous recording client, so this file follows the documented `Listing` / `t3` shape with made-up ids, users, and `example.org` / fictitious GitHub links. It covers a self post with links, a link post, a stickied thread, an `i.redd.it` image, a removed post, an old post, and a non-post child. |
