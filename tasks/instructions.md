# Operator Instructions — WC2026 Predictor

**Purpose:** How to *use* the system once it's built. The build instructions are in [mvp-plan.md](mvp-plan.md) and [production-plan.md](production-plan.md); this file is the runbook for the human operating the running system.

**Audience:** Whoever is running the game day-to-day (default: Varun) and the backup runner.

---

## Part 1 — Running the MVP

The MVP is a local-first demo. You run it on your laptop and present a deployed copy to leads for sign-off. There are no daily operations — once built, you run it as needed.

### 1.1 First-time local setup (5 min)

```
git clone <repo-url>
cd wc2026-predictor
npm install
```

### 1.2 Generate fixtures (one-off)

```
npm run parse-template
```
Produces `data/fixtures/{teams,groups,matches}.json` from the Excel template. Re-run only if the template changes.

### 1.3 Add sample participants

For each of 5 sample players:
1. Copy `asset/WC2026_Predictor_Entry_Sheet (v1).xlsx`
2. Save into `data/submissions/` as `Player<N>_<name>.xlsx`
3. Fill the yellow cells (group scores, knockout picks, tiebreaker, name in `U2`)
4. Tip: deliberately put a typo ("Brasil") in one file to demo fuzzy matching

### 1.4 Ingest

```
npm run ingest
```
Watch the log. Every file should show `[OK]` or `[WARN]`. `[ERROR]` lines must be fixed (open the Excel, correct the issue, save, re-run).

### 1.5 Add a sample matchday result

Create `data/results/2026-06-11.json` with 3 group matches (see [mvp-plan.md §5.2](mvp-plan.md) for the format).

### 1.6 Build and view

```
npm run build
npx @11ty/eleventy --serve
```
Open `http://localhost:8080` in a browser:
- `/` — leaderboard
- `/me/<token>/` — pick any token from `data/predictions/`
- `/results/` — match results
- `/digest.html` — sample daily email

### 1.7 Run the test suite

```
npm test
```
All 13 scoring tests + ingestion tests should pass. If any fail, do not demo — fix first.

### 1.8 Deploy to GitHub Pages

```
git add .
git commit -m "MVP demo data"
git push
```
GitHub Actions builds and deploys automatically. URL is printed in the Actions log (or in repo Settings → Pages).

### 1.9 MVP demo walkthrough (~5 min, for leads)

Follow the script in [mvp-plan.md §9.2](mvp-plan.md). At a glance:

1. **Open the URL** → show leaderboard
2. **Click a player handle** → show `/me/<token>/`; try guessing another token → 404; show `robots.txt`
3. **Show one source Excel** in Excel app, then its parsed JSON in `data/predictions/`
4. **Demo the fuzzy match** — show the ingest log warning for "Brasil"
5. **Run `npm test` in front of them** — point at the rules-doc example tests
6. **Open `digest.html`** — show the daily email format
7. **Reference [production-plan.md](production-plan.md)** for what's next

### 1.10 Common MVP issues

| Symptom | Cause | Fix |
|---|---|---|
| `npm run build` fails with Tailwind config error | Tailwind v3 vs v4 mismatch | Pin Tailwind to v3 in `package.json`, run `npm install` |
| `Eleventy pagination produced 0 pages` | `data/predictions/` is empty | Run `npm run ingest` first |
| `/me/<token>/` shows wrong data | Stale `_site/` | Delete `_site/` and rebuild |
| `npm test` fails on a scoring case | Bug in `score.js` or rules-doc misread | Open the failing test, read the assertion vs the rules doc verbatim, fix the function (not the test) |
| Excel file refuses to parse | Saved as `.xls` not `.xlsx`, or corrupted | Open in Excel, Save As → `.xlsx`, retry |

---

## Part 2 — Running the Production system

This is the steady-state operating manual for the 39 days of the tournament (11 Jun – 19 Jul 2026). Expect ~5 min/day of attention, more on result-correction days.

### 2.1 Pre-tournament checklist (run on 10 Jun evening)

See [production-plan.md — Pre-launch checklist](production-plan.md) for the full list. Don't skip this — every item exists because something can go wrong if you do.

### 2.2 Daily operations runbook

**Every morning at ~09:00 UK** (after the 08:30 digest send):

1. **Check the GitHub Actions tab** — confirm last night's scheduled run succeeded (green checkmark on 07:00 UTC entry)
2. **Open your own copy of the digest** in Outlook — confirm it arrived and renders correctly
3. **Open the public site** — spot-check the leaderboard for sanity:
   - Top 3 vs your own mental model of what should happen
   - Any player with implausibly high or low points → investigate
4. **Scan `data/results/<yesterday>.json`** in the repo — confirm the match results look correct (right teams, plausible scores, no nulls in `winner` for completed knockouts)
5. **Triage any participant queries** in your inbox — reply within the day

If everything looks normal, you're done. Total time: 3–5 min.

### 2.3 Things you may need to do mid-tournament

#### 2.3.1 Correcting a wrong result

A match was completed but the API returned the wrong score (or didn't return it at all).

```
cd <repo>
git pull
# Edit data/results/<YYYY-MM-DD>.json — fix the score, add "manualOverride": true to that match
git add data/results/<YYYY-MM-DD>.json
git commit -m "Override result for <match> on <date>"
git push
```
The push triggers a rebuild. Within ~3 minutes the site is updated. The cron job won't overwrite a match marked `manualOverride: true`.

#### 2.3.2 Re-triggering a failed build

GitHub → Actions tab → click the failed run → "Re-run all jobs". Or:

GitHub → Actions → **Deploy** workflow → "Run workflow" → branch: main → green button.

#### 2.3.3 Forcing a rebuild without code changes

Same as above — Actions → Deploy → Run workflow. Useful after correcting a result.

#### 2.3.4 Re-sending a missed digest

If the Power Automate flow failed (you'll receive a self-email if the on-failure branch fires):

1. **Quick fix:** open `<site>/digest.html` in the browser, **View source**, copy entire HTML
2. New email in Outlook → paste source → To: distribution list → Subject: as usual → Send
3. Then go to make.powerautomate.com → check the run history → diagnose the failure (usually transient HTTP 5xx; just **re-run** the failed run)

#### 2.3.5 Adding a late participant

**Don't.** The bracket locks at kickoff; admitting late entries undermines the game's integrity and the comms you sent. Politely decline.

If there's a truly exceptional reason (e.g. you forgot to include someone who registered):

1. Get their filled Excel into `data/submissions/`
2. Run `npm run ingest` locally
3. Commit + push
4. Send them their personal-link email
5. Document the exception in `data/manual-overrides.md`

#### 2.3.6 Handling a participant complaint

> "My points are wrong on match X"

1. Get their token (handle or name → look up in `data/predictions/`)
2. Open their `data/predictions/<token>.json` — find the relevant `groupScores[matchId]` or knockout pick
3. Open the matching entry in `data/results/`
4. Walk through the scoring rules manually:
   - Group: did outcome match? Did exact score match?
   - Knockout: is the team in the corresponding `roundX` array? Did the team actually reach that round in results?
5. If the rules say one thing and the leaderboard says another → it's a scoring bug:
   - Reproduce in a unit test in `scripts/score.test.js` first (red)
   - Fix `score.js`
   - Confirm the test now passes (green)
   - Commit + push; leaderboard auto-corrects on next build
6. Reply to the participant with the explanation; thank them if they caught a real bug

#### 2.3.7 Power Automate flow stops working

In [make.powerautomate.com](https://make.powerautomate.com):
- Open the flow → Run history → look at the last few runs
- Most common: HTTP fetch returned 5xx (transient — just re-run)
- Authentication expired: re-connect the Office 365 Outlook connector
- Quota: you've hit the M365 daily send limit (unlikely at <100 recipients)

Fallback: manual forward (see 2.3.4).

#### 2.3.8 football-data.org returns garbage

- Check `data/results/raw/<date>.json` for what the API actually returned
- If the response is empty or wrong: fall back to manual results entry until the API recovers
- If a team code in the API doesn't match yours: extend the mapping in `scripts/team-code-map.js`, push, rebuild

### 2.4 Things you should NOT do

- ❌ Edit `data/predictions/<token>.json` to change a player's picks. **Never.** Predictions are locked at kickoff. The only allowed edit is to a `warnings` entry to record a manual triage decision (and even that should be a comment, not a behaviour change).
- ❌ Delete `data/archive/<date>.json` files. They feed the movers calculation. If you need to fix one, edit it; don't remove it.
- ❌ Force-push to `main`. Use a normal commit. The Action will rebuild.
- ❌ Run `npm run parse-template` after the tournament has started. It would overwrite your fixtures with template data that may now be stale.
- ❌ Manually edit `_site/`. It's generated. Edit the source and rebuild.
- ❌ Skip the dress rehearsal (Phase G.4). Every problem you don't find in rehearsal, you'll find on tournament day with 50 angry colleagues watching.

### 2.5 End-of-tournament wrap (19–22 Jul)

See [production-plan.md — Phase I](production-plan.md). At a glance:

1. **Day after Final (20 Jul):** confirm 18 Jul (3rd-place) and 19 Jul (Final) results are correct; manual override if needed
2. **Apply tiebreaker** if leaderboard top spots are tied: compute `actualTotalGoals` from sum of all results, winner = smallest `|prediction - actual|`
3. **Send wrap-up email** to participants with final top 3
4. **Tag the repo** `v1.0-tournament-final`, push tags
5. **Turn off the Power Automate flow** (don't delete — re-use next year)
6. **Capture lessons** in [lessons.md](lessons.md) — what worked, what didn't, what to change

### 2.6 Backup runner handover

If you'll be unavailable for >1 day during the tournament, brief the backup runner with this exact email:

```
Subject: WC2026 Predictor — backup cover for <dates>

Hi <name>,

I'm out <dates>. The predictor game runs itself but here's what you need:

1. Repo: <URL>
2. Power Automate flow: <URL>
3. Daily check: ~5 min — see tasks/instructions.md §2.2
4. If a result is wrong: §2.3.1
5. If the digest doesn't send: §2.3.4
6. If anything else goes wrong: my number is <X>

Thanks,
Varun
```

The backup runner needs:
- Repo push access (add via repo Settings → Collaborators)
- Power Automate flow co-ownership (open flow → ⋯ → Share)
- A copy of the participants distribution list (BCC fallback)

---

## Part 3 — Reference

### 3.1 Key file locations

| What | Where |
|---|---|
| Game rules (source of truth) | [asset/WC2026_Predictor_Game_Rules (v1).docx](../asset/) |
| Entry sheet template | [asset/WC2026_Predictor_Entry_Sheet (v1).xlsx](../asset/) |
| Architecture overview | [docs/workflow.md](../docs/workflow.md) |
| MVP build steps | [mvp-plan.md](mvp-plan.md) |
| Production build steps | [production-plan.md](production-plan.md) |
| Locked cell map | [mvp-plan.md Appendix A](mvp-plan.md) |
| Lessons & post-incident notes | [lessons.md](lessons.md) |
| Fixtures (generated) | `data/fixtures/` |
| Predictions (generated) | `data/predictions/` |
| Daily results | `data/results/` |
| Leaderboard archive | `data/archive/` |
| Source xlsx (production) | `data/submissions/` *(gitignored in prod)* |
| Manual override log | `data/manual-overrides.md` |
| Scoring engine | `scripts/score.js` |
| Tests | `scripts/*.test.js` |
| GH Actions workflow | `.github/workflows/deploy.yml` |

### 3.2 Useful commands

```
# Local
npm install                           # install deps
npm run parse-template                # regenerate fixtures (rare)
npm run ingest                        # parse submissions → predictions
npm test                              # run all tests
npm run build                         # full build into _site/
npx @11ty/eleventy --serve            # local dev server with live reload

# Git / deploy
git status                            # always check before committing
git push                              # triggers GH Actions deploy
gh run watch                          # tail the active GH Action (if gh CLI installed)
gh run list --limit 5                 # recent runs

# Diagnostics
node -e "const fs=require('fs'); console.log(fs.readdirSync('data/predictions').length, 'predictions')"
node scripts/fetch-results.js --dry-run --date 2026-06-11    # if implemented
```

### 3.3 Glossary

- **Token**: 32-char hex string, derived from `sha256(name + sourceFile)`. Used as URL slug for `/me/<token>/` and as primary key in `predictions/`. Unguessable.
- **Handle**: Public display name, alphanumeric + underscore, max 20 chars. Used on the leaderboard.
- **Capability URL**: A URL where knowledge of the URL itself is the credential. Used for `/me/<token>/`. Same pattern as Google Docs "anyone with the link."
- **Manual override**: A result marked with `"manualOverride": true` won't be overwritten by the next API fetch. Use when correcting an API error.
- **Knockout independence**: A team predicted in a knockout round earns points if it reaches that round, regardless of which match or opponent. Rule from the game spec.
- **Template signature**: A set of cells in the entry sheet that must remain unchanged (e.g. team names in the group blocks). Ingestion fails loudly if a participant has edited them.
- **Dress rehearsal**: Full end-to-end run with realistic data before the tournament starts. Phase G.4 in the production plan.

### 3.4 Escalation contacts

| Issue | Contact |
|---|---|
| GH Pages outage | [GitHub Status](https://www.githubstatus.com/) |
| football-data.org outage | [Status page](https://www.football-data.org) |
| M365 / Power Automate outage | Accenture IT helpdesk |
| Tournament rule dispute | Refer to `asset/WC2026_Predictor_Game_Rules (v1).docx` — it's the spec, end of debate |
