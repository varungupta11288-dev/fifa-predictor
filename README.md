# WC2026 Predictor

Scoring + leaderboard site for a FIFA World Cup 2026 prediction game. Static site, no runtime backend.

## What's in the box

- **Fixtures** (`data/fixtures/`) — parsed from the canonical [entry sheet template](asset/) once: 48 teams, 12 groups, 104 matches.
- **Scoring engine** ([scripts/score.js](scripts/score.js)) — pure function, 14 unit tests covering the rules-doc worked examples + edge cases.
- **Ingestion** ([scripts/ingest.js](scripts/ingest.js)) — reads `data/submissions/*.xlsx`, emits `data/predictions/<token>.json`. Deterministic token = `sha256(name + filename)`.
- **Static site** (`src/`) — Eleventy + Tailwind v3. Leaderboard at `/`, per-player view at `/me/<token>/` (noindexed + `robots.txt` disallowed), `/results/`, `/rules/`.
- **Daily digest** ([scripts/build-digest.js](scripts/build-digest.js)) — standalone `digest.html` with inline styles, suitable for emailing.
- **GitHub Action** ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) — builds + tests + deploys to GitHub Pages on push, on `workflow_dispatch`, and daily at 07:00 UTC.

## Commands

```bash
npm install                # one-off
npm run parse-template     # rebuild fixtures from asset/*.xlsx (rarely needed)
npm run generate-samples   # write 5 sample submissions into data/submissions/
npm run ingest             # read data/submissions/*.xlsx → data/predictions/*.json
npm test                   # 23 tests, ~2s
npm run build              # CSS → site → digest, output to _site/
```

## Demo data

5 synthetic participants live in `data/submissions/` (generated, not hand-filled). One of them deliberately types "Brasil" instead of "Brazil" to exercise the fuzzy team-name match in ingestion.

Hand-authored matchday-1 results are at `data/results/2026-06-11.json` (3 matches). The current leaderboard reflects scoring those 3 matches against the 5 predictions.

## Adding results during the tournament

Drop a new file `data/results/YYYY-MM-DD.json` with the day's completed matches, commit, push. The Action will rebuild and redeploy on its next run (or trigger manually via `workflow_dispatch`).

For schema, see the example in `data/results/2026-06-11.json` and the [`Result JSON`](tasks/mvp-plan.md#31-schemas) section of the plan.

## Why xlsx@0.18 despite the audit warning

SheetJS hasn't published a fix on npm; we only read files we generate locally, so the prototype-pollution risk is contained. The production plan ([tasks/production-plan.md](tasks/production-plan.md)) should switch to either the SheetJS-hosted CDN build or a different library before accepting third-party uploads.

## Demo walkthrough

See [tasks/mvp-plan.md §9.2](tasks/mvp-plan.md) for the 5-minute walkthrough script.
