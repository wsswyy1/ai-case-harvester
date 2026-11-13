# Demo video outline (about 3 minutes)

Record a public YouTube or Vimeo video, about three minutes, walking through the stitched body of this Frankenstein project. Keep secrets off screen: no `.env`, no token values, no Authorization headers.

Suggested runtime: 2:45–3:15. Shoot the dashboard in the Halloween theme, with the project repo and a terminal nearby.

## 0:00–0:15 — The problem

- One sentence: usecasecn collects real AI use cases, and finding them by hand across HN, GitHub, and Reddit is slow.
- Show https://usecasecn.xyz briefly, then cut to this repo.

## 0:15–0:35 — The stitch

- Name the Kiroween category: Frankenstein.
- Three organs on screen (slide or repo tree): collectors, classifier, review desk.
- One line on the rule set: real case, project link, dedupe by URL or repo, pending only.

## 0:35–1:10 — Harvest

- Start a harvest from the dashboard or `npm run harvest`.
- Show requests going to public APIs only (HN Algolia, GitHub Search, Reddit JSON).
- Call out rate-limit manners: stable User-Agent, stop on 429.
- Land on a short run summary: fetched / kept / duplicates.

## 1:10–1:40 — Classify and dedupe

- Open one kept case.
- Show the verdict, usecasecn category, tool tags, and the one-line Chinese summary.
- Show two source posts collapsing into one canonical repository or project URL.

## 1:40–2:20 — Review

- Walk the dark “graveyard” queue.
- Filter, read excerpt and project link, then Approve one case and Reject another with a reason.
- Say out loud: local approve does not publish on usecasecn.

## 2:20–2:45 — Export or push

- Export approved cases as JSON and open the file (title, summary, source, project, evidence).
- If a sandbox intake is configured, push one case and show a **pending** receipt. Otherwise stop at export and say push is opt-in via environment variables.
- Do not show tokens.

## 2:45–3:00 — How Kiro was used

- Flash `.kiro/specs/case-harvester/` (requirements, design, tasks).
- Mention steering — especially `usecasecn-rules.md` — and hooks (tests on save, spec-driven README update, secret scan).
- Close on the public GitHub repo, the MIT license, and a thank-you.

## Shot list and assets

- [ ] Halloween dashboard, empty state and a populated queue
- [ ] Terminal harvest run with no secrets in the output
- [ ] One classified case with a Chinese one-liner
- [ ] Before/after of a duplicate merge
- [ ] Exported JSON
- [ ] Optional pending receipt
- [ ] `.kiro/` tree

## Audio notes

Speak in English for the judges; a short Chinese line about usecasecn at the beginning is welcome. Avoid background music that would block narration. Caption source names and the “pending only” rule.
