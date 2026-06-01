# WC2026 Predictor

Scoring + leaderboard site for a FIFA World Cup 2026 prediction game. Static site, no runtime backend. Players submit one entry sheet up-front; the site scores it as real results arrive from the football-data.org API.

## What's in the box

- **Fixtures** (`data/fixtures/`) — the real tournament structure: 48 teams, 12 groups, 104 matches (`teams.json`, `groups.json`, `matches.json`). `schedule.json` holds kickoff times + live scores, refreshed from the API.
- **Scoring engine** ([scripts/score.js](scripts/score.js)) — pure function, unit-tested against the rules-doc worked examples + edge cases.
- **Ingestion** ([scripts/ingest.js](scripts/ingest.js)) — reads `data/submissions/*.xlsx`, emits `data/predictions/<token>.json`. Deterministic token = `sha256(PREDICTOR_SECRET | email)`, truncated to 32 hex chars, so the same email always maps to the same per-player URL and a leaked email alone can't be used to guess the token.
- **Static site** (`src/`) — Eleventy + Tailwind v3. Leaderboard at `/`, per-player view at `/me/<token>/` (noindexed + `robots.txt` disallowed), `/fixtures/`, `/rules/`.
- **Daily digest** ([scripts/build-digest.js](scripts/build-digest.js)) — standalone `digest.html` with inline styles, suitable for emailing.
- **GitHub Action** ([.github/workflows/test.yml](.github/workflows/test.yml)) — runs tests + a sanity build against an empty leaderboard on push. Real deploys happen locally (see below).

## Environment setup

Copy `.env.example` to `.env` and set:

- `PREDICTOR_SECRET` — salt used to derive per-player URL tokens. Pick a real value and **never change it after sharing links** (changing it invalidates every player's URL).
- `FOOTBALL_API` — football-data.org API token, required for fetching fixtures/results.

## Commands

```bash
npm install                # one-off
npm run parse-template     # rebuild fixtures from asset/*.xlsx (rarely needed)
npm run generate-samples   # write synthetic sample submissions into data/submissions/ (DEMO ONLY)
npm run ingest             # read data/submissions/*.xlsx → data/predictions/*.json
npm run links              # print share-links for every ingested prediction
npm run fetch:schedule     # pull fixtures + finished results from football-data.org
npm test                   # tests, ~2s
npm run build              # CSS → site → digest, output to _site/
npm run deploy             # test → fetch:schedule → ingest → build → push _site/ to gh-pages
npm run admin              # local admin UI on http://127.0.0.1:5174
```

## Admin console

`npm run admin` launches a loopback-only Node server with a one-page UI:

- **① Submissions** — drag-and-drop `.xlsx` files straight into `data/submissions/`.
- **② Build & Deploy** — three buttons:
  - **🚀 Deploy** — the daily button. Runs the full pipeline (`fetch:schedule → ingest → build → push`): pulls latest scores, rescores every player, rebuilds, and publishes to gh-pages.
  - **📅 Refresh fixtures** — runs `fetch:schedule` only. Updates `data/fixtures/schedule.json` and `data/results/` but does **not** rescore or publish. Use it for a dry-run peek at raw results; the live leaderboard stays unchanged until you Deploy.
  - **🔗 Generate links** — prints per-player share URLs.
- **③ Push code changes** — stage tracked files, type a commit message, push to `origin/main` from the browser.

Auth is a per-boot token embedded in the served HTML (logged at startup as part of the URL). Bound to `127.0.0.1` only — never exposed beyond your machine.

## Daily operation during the tournament

Match results come from the **football-data.org** API (WC competition), not hand-authored files. `scripts/fetch-schedule.js` fetches all 104 matches and writes:

- `data/fixtures/schedule.json` — kickoff times, teams, and scores for the **Fixtures** page.
- `data/results/YYYY-MM-DD.json` — one file per match day, **finished matches only**, in the scoring schema `score.js` consumes. Team codes are mapped from the API's FIFA TLAs to our ISO-3 codes, and group scores are oriented to our fixture's home/away.

So from 11 Jun the daily routine is **a single click of 🚀 Deploy** in the admin console (`npm run admin`). The API is the single source of truth for results — no manual score entry, and no hand-authored `data/results/*.json` files are needed.

## Privacy and the deploy model

Player submissions and ingested predictions are gitignored — they never enter the public repo. Only the **rendered HTML** of the site (with `email` and `sourceFile` stripped at the data layer) is published. Because the repo has no player data, CI can only run tests + a sanity build against an empty leaderboard; real deploys are done **locally** via `npm run deploy`, which pushes `_site/` to the `gh-pages` branch through a git worktree. GitHub Pages must serve from `gh-pages` / `(root)` (Settings → Pages → Source → "Deploy from a branch").

## ⚠️ Pre-kickoff: remove all mock data

The repo ships with demo data so the site renders before any real entries exist. **Before you ingest real submissions and go live, remove it all** so no synthetic player or fake result pollutes the real leaderboard.

There are four sources of mock data. Three are gitignored (delete the files); one (`data/results/2026-06-11.json`) is **committed to git**, so it must be removed with `git rm` or its fake scores will keep scoring players.

| What | Path | Git status | How it got there |
|---|---|---|---|
| Sample submissions | `data/submissions/*.xlsx` | gitignored | `npm run generate-samples` |
| Ingested predictions | `data/predictions/*.json` | gitignored | derived from submissions by `npm run ingest` |
| Sample share-links | `data/links/*.md` | gitignored | `npm run links` |
| Demo matchday-1 results | `data/results/2026-06-11.json` | **committed** | hand-authored demo (3 fake matches) |

**Cleanup (PowerShell):**

```powershell
# 1. Delete gitignored demo artifacts (submissions, predictions, links)
Remove-Item data/submissions/*.xlsx, data/predictions/*.json, data/links/*.md -ErrorAction SilentlyContinue

# 2. Remove the committed demo results file (fake scores) and commit the removal
git rm data/results/2026-06-11.json
git commit -m "chore: remove demo matchday-1 results before kickoff"

# 3. Verify a clean, zero-player state
npm run build      # leaderboard should render with 0 players and 0 scored matches
```

What you keep: everything under `data/fixtures/` (`teams.json`, `groups.json`, `matches.json`, `schedule.json`) is **real** tournament data — leave it. `schedule.json` carries no scores until matches finish; `fetch:schedule` fills those in.

**Go live:**

1. Drop the real player `.xlsx` files into `data/submissions/` (admin **① Submissions**).
2. Click **🚀 Deploy**. This ingests the real entries, fetches live data, scores, and publishes.

After cleanup `git status` should be clean apart from the deploy commit, and the leaderboard should list real players only.

## Entry-sheet download

The blank template is published at `{{ site.baseUrl }}/WC2026-entry-sheet.xlsx` via a copy at
[_site-static/WC2026-entry-sheet.xlsx](_site-static/WC2026-entry-sheet.xlsx) (linked from the
[How to enter](src/pages/how-to-enter.njk) page). This is a **copy** of the source-of-truth
[asset/WC2026_Predictor_Entry_Sheet (v1).xlsx](asset/) — if the `asset/` template changes, re-sync the published
copy: `copy "asset\WC2026_Predictor_Entry_Sheet (v1).xlsx" "_site-static\WC2026-entry-sheet.xlsx"`.

## Why xlsx@0.18 despite the audit warning

SheetJS hasn't published a fix on npm; we only read files we generate locally, so the prototype-pollution risk is contained. The production plan ([tasks/production-plan.md](tasks/production-plan.md)) should switch to either the SheetJS-hosted CDN build or a different library before accepting third-party uploads.
