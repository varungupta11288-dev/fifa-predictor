# WC2026 Predictor

Scoring + leaderboard site for a FIFA World Cup 2026 prediction game. Static site, no runtime backend.

## What's in the box

- **Fixtures** (`data/fixtures/`) — parsed from the canonical [entry sheet template](asset/) once: 48 teams, 12 groups, 104 matches.
- **Scoring engine** ([scripts/score.js](scripts/score.js)) — pure function, 14 unit tests covering the rules-doc worked examples + edge cases.
- **Ingestion** ([scripts/ingest.js](scripts/ingest.js)) — reads `data/submissions/*.xlsx`, emits `data/predictions/<token>.json`. Deterministic token = `sha256(name + filename)`.
- **Static site** (`src/`) — Eleventy + Tailwind v3. Leaderboard at `/`, per-player view at `/me/<token>/` (noindexed + `robots.txt` disallowed), `/fixtures/`, `/rules/`.
- **Daily digest** ([scripts/build-digest.js](scripts/build-digest.js)) — standalone `digest.html` with inline styles, suitable for emailing.
- **GitHub Action** ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) — builds + tests + deploys to GitHub Pages on push, on `workflow_dispatch`, and daily at 07:00 UTC.

## Commands

```bash
npm install                # one-off
npm run parse-template     # rebuild fixtures from asset/*.xlsx (rarely needed)
npm run generate-samples   # write 5 sample submissions into data/submissions/
npm run ingest             # read data/submissions/*.xlsx → data/predictions/*.json
npm run links              # print share-links for every ingested prediction
npm test                   # tests, ~2s
npm run build              # CSS → site → digest, output to _site/
npm run deploy             # test → ingest → build → push _site/ to gh-pages branch
npm run admin              # local admin UI on http://127.0.0.1:5174 (upload + deploy + push)
```

### Admin console

`npm run admin` launches a tiny loopback-only Node server with a one-page UI:

- Drag-and-drop `.xlsx` files straight into `data/submissions/`
- Click to run `npm run deploy` or `npm run links` with live streaming output
- Stage modified tracked files, type a commit message, push to `origin/main` from the browser

Auth is a per-boot token embedded in the served HTML (logged at startup as part of the URL). Bound to `127.0.0.1` only — never exposed beyond your machine.

## Privacy and the deploy model

Player submissions and ingested predictions are gitignored — they never enter the public repo. Only the **rendered HTML** of the site (with `email` and `sourceFile` stripped at the data layer) is published.

This means **CI can't build a full site** (it has no data). The workflow at [.github/workflows/test.yml](.github/workflows/test.yml) only runs tests + a sanity build against an empty leaderboard. Real deploys are done **locally**:

```bash
npm run deploy
```

That chains test → ingest → build → push `_site/` to the `gh-pages` branch via a git worktree. GitHub Pages must be configured to serve from `gh-pages` / `(root)` (Settings → Pages → Source → "Deploy from a branch").

Run `npm run deploy` after every batch of new submissions or new match results.

## Demo data

5 synthetic participants live in `data/submissions/` (generated, not hand-filled). One of them deliberately types "Brasil" instead of "Brazil" to exercise the fuzzy team-name match in ingestion.

Hand-authored matchday-1 results are at `data/results/2026-06-11.json` (3 matches). The current leaderboard reflects scoring those 3 matches against the 5 predictions.

## Results during the tournament (automated)

Match results come from the **football-data.org** API (WC competition), not hand-authored files. `scripts/fetch-schedule.js` fetches all 104 matches and writes two things:

- `data/fixtures/schedule.json` — kickoff times, teams, and scores for the **Fixtures** page.
- `data/results/YYYY-MM-DD.json` — one file per match day, **finished matches only**, in the scoring schema `score.js` consumes. Team codes are mapped from the API's FIFA TLAs to our ISO-3 codes, and group scores are oriented to our fixture's home/away.

This fetch is folded into `npm run deploy`, so the **daily operation from 11 Jun is a single click of _Deploy_ in the admin console** (`npm run admin`): it pulls the latest scores, regenerates results, rescores every player, rebuilds, and pushes to gh-pages. Requires `FOOTBALL_API` in `.env`. To refresh without publishing, click **Refresh fixtures** (runs `npm run fetch:schedule`).

> The sample `data/results/2026-06-11.json` is demo data; it is overwritten by real results on opening day. Manual `data/results/*.json` files are no longer needed — the API is the single source of truth.

## Entry-sheet download

The blank template is published at `{{ site.baseUrl }}/WC2026-entry-sheet.xlsx` via a copy at
[_site-static/WC2026-entry-sheet.xlsx](_site-static/WC2026-entry-sheet.xlsx) (linked from the
[How to enter](src/pages/how-to-enter.njk) page). This is a **copy** of the source-of-truth
[asset/WC2026_Predictor_Entry_Sheet (v1).xlsx](asset/) — if the `asset/` template changes, re-sync the published
copy: `copy "asset\WC2026_Predictor_Entry_Sheet (v1).xlsx" "_site-static\WC2026-entry-sheet.xlsx"`.

## Why xlsx@0.18 despite the audit warning

SheetJS hasn't published a fix on npm; we only read files we generate locally, so the prototype-pollution risk is contained. The production plan ([tasks/production-plan.md](tasks/production-plan.md)) should switch to either the SheetJS-hosted CDN build or a different library before accepting third-party uploads.

## Demo walkthrough

See [tasks/mvp-plan.md §9.2](tasks/mvp-plan.md) for the 5-minute walkthrough script.
