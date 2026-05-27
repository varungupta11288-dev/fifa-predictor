# Production Implementation Plan — WC2026 Predictor

**Purpose:** Take the working MVP (see [mvp-plan.md](mvp-plan.md)) and harden it for the real tournament — 50–100 colleagues from Accenture + RMG, 39 days of automated daily operations from 11 Jun – 19 Jul 2026. This document is the delta from MVP to production. Anyone with the MVP running locally should be able to follow these steps to ship the full system.

**Time estimate:** ~3 working days spread across registration, build, and a dress-rehearsal week.
**Pre-condition:** MVP from [mvp-plan.md](mvp-plan.md) is complete, all tests pass, the demo site is deployed.

---

## 0. What changes from MVP → production

| Component | MVP | Production |
|---|---|---|
| Participants | 5 hand-filled Excels | 50–100 collected via OneDrive folder |
| Registration | None | Microsoft Form → SharePoint list |
| Results data | Hand-authored JSON | football-data.org API, daily auto-fetch |
| Daily build trigger | Manual `npm run build` | GitHub Actions cron at 07:00 UTC |
| Email digest | Opened in browser for demo | Power Automate sends from your M365 inbox at 08:30 UK |
| Movers | Placeholder text | Real rank-delta vs yesterday's archived leaderboard |
| Manual override | n/a | Edit `results/*.json`, push, site rebuilds |
| Backup runner | Single owner | Designated co-owner with re-trigger access |

**No code changes** to the core `score()` function, the ingestion logic, the Eleventy templates, or the site layout. Production is *additions* on top of the MVP, not a rewrite.

---

## Phase A — Registration (target: 28 May → 6 Jun)

### A.1 Create the Microsoft Form (15 min)

1. Open [forms.office.com](https://forms.office.com), sign in with your Accenture account.
2. Click **New Form** → title: `WC 2026 Predictor — Registration`.
3. Description (paste this text):
   > Sign up to play the FIFA World Cup 2026 Predictor with Accenture + RMG colleagues. After you register, you'll receive the entry sheet to fill in by **10 Jun 23:59 UK**. The tournament runs 11 Jun – 19 Jul; you'll get a daily leaderboard email throughout. Game rules: [link to rules]. Open to all.
4. Add the following fields exactly:

| # | Type | Label | Required | Notes |
|---|---|---|---|---|
| 1 | Short answer | Full name | yes | For records / tie-break disputes |
| 2 | Short answer | Work email | yes | Validation: must contain `@` |
| 3 | Choice | Tenant | yes | Options: `Accenture`, `RMG`, `Other` |
| 4 | Short answer | Chosen handle (public leaderboard display name; max 20 chars, alphanumeric + underscore) | yes | |
| 5 | Choice | "I will submit my entry sheet by 10 Jun 23:59 UK" | yes | Single option: `Yes, I confirm` |

5. **Settings**:
   - Anyone with the link can respond (so RMG users outside your tenant can submit)
   - One response per person — leave **OFF** (don't gate by email — RMG users may not authenticate)
   - Record name — leave **OFF** (you collect name explicitly via field 1)
   - Accept responses until **6 Jun 23:59**

6. Copy the share link. Note the auto-generated Excel/SharePoint list URL where responses land — you'll need it during Phase C.

### A.2 Announcement comms (30 min)

Write three artifacts:

**A.2.1 — Teams post / kickoff email** (for launch day, 28 May):
```
Subject: World Cup 2026 Predictor — sign up by 6 Jun

Hi all,

I'm running a FIFA World Cup 2026 predictor game for Accenture + RMG colleagues. Open to anyone — no Excel jockeying skills required.

How it works:
- Sign up: <FORMS LINK> (closes 6 Jun)
- You'll get an entry sheet to fill in by 10 Jun 23:59 UK
- I'll send a daily leaderboard during the tournament (11 Jun – 19 Jul)
- Prize: <free / TBD / £X per entry>

Full rules: <link to deployed site rules page>

Reply or DM with questions.

— Varun
```

**A.2.2 — Reminder** (3 Jun): Forward the original with "Last chance — closes Friday."

**A.2.3 — Confirmation email template** (auto-replied from M365 via a Power Automate flow on form submission — see A.3, or send by hand if you skip the flow):
```
Subject: You're in — World Cup 2026 Predictor

Hi <name>,

Thanks for signing up. The entry sheet will arrive on Saturday 7 Jun. You'll have until Wednesday 10 Jun 23:59 UK to fill in and return it. Late entries can't be accepted (the bracket locks at kickoff).

Looking forward to it,
— Varun
```

### A.3 (Optional) Auto-confirmation flow (20 min)

In [make.powerautomate.com](https://make.powerautomate.com):
- New flow → **Automated cloud flow**
- Trigger: *Microsoft Forms — When a new response is submitted* → select your form
- Action: *Microsoft Forms — Get response details* → use the dynamic Response Id
- Action: *Office 365 Outlook — Send an email (V2)* → To: response's email field, Subject + Body from template A.2.3
- Save & turn on

If you skip this, send confirmations by hand at registration close.

### A.4 Acceptance for Phase A
- [ ] Form is live and reachable from a non-Accenture browser session (open in incognito to test)
- [ ] At least one test submission lands in the SharePoint response list
- [ ] Announcement is queued or sent

---

## Phase B — Submission window (7 Jun → 10 Jun 23:59)

### B.1 Send the entry sheet (8 Jun morning)

After registration closes:

1. Export the SharePoint response list to Excel; save as `data/registrations.xlsx` (gitignored).
2. Compose an email in Outlook (use the registrations list as a BCC distribution; one mail, all recipients):
   ```
   Subject: World Cup 2026 Predictor — your entry sheet

   Hi,

   Thanks for signing up. Attached is the entry sheet — please:

   1. Fill in every YELLOW cell
   2. Save the file as: YourName.xlsx (e.g. Varun_Gupta.xlsx)
   3. Reply with the file attached, or drop it into <ONEDRIVE LINK> by 10 Jun 23:59 UK

   Late entries can't be accepted — the bracket locks at tournament kickoff (11 Jun, 17:00 UK).

   Full rules: <link to deployed site rules page>

   Cheers,
   Varun
   ```
   Attach `asset/WC2026_Predictor_Entry_Sheet (v1).xlsx`.

3. Create a OneDrive folder named `WC2026-submissions/` and share it with **"Anyone with the link can upload"**. Paste the link into the email.

### B.2 Chase workflow (9–10 Jun)

Daily during the window:

1. Pull the latest list of received files from the OneDrive folder.
2. Diff against the registrations list to find non-submitters.
3. Send a short prod to non-submitters at end of day 9 Jun and start of day 10 Jun.

### B.3 Hard cutoff handling (10 Jun 23:59)

After cutoff, anyone who registered but did not submit is dropped from the game. Send them a one-liner acknowledging this so they don't expect a daily email.

### B.4 Acceptance for Phase B
- [ ] All received `.xlsx` files copied from OneDrive into `data/submissions/` in the repo
- [ ] Filenames sanitized (no spaces, no special chars) — rename if needed
- [ ] List of dropped non-submitters captured in a side note for the kickoff comms

---

## Phase C — Bulk ingestion + pre-tournament build (10 Jun 23:59 → 11 Jun morning)

### C.1 Pre-flight

```
cd <repo>
git pull
ls data/submissions/    # confirm all submitted files are present
```

### C.2 Run ingestion at scale

```
npm run ingest 2>&1 | tee ingest.log
```

For 50–100 files this completes in seconds. Review `ingest.log`:
- Every file should show `[OK]` or `[WARN]`.
- `[ERROR]` lines (e.g. template signature mismatch, empty name) **must** be triaged: open the offending Excel, fix the issue, save, re-run ingestion. The script is idempotent — already-clean files re-emit identical JSON.

### C.3 Triage warnings

For each prediction with warnings:
- **Unresolvable team name** → open the Excel, see what the participant typed. Either:
  - Decide it's a typo of a real team → manually edit the JSON's `warnings` entry to record the resolution, and patch the affected `roundX` / `winner` field with the correct team code, OR
  - Genuinely cannot resolve → leave `null` (player just won't earn knockout points for that slot)
- **Inconsistent bracket** (R16 not ⊆ R32, etc.) → fine, no action needed; the player can still be scored, they just made an inconsistent prediction
- **Missing group score** → fine; that match scores 0 for that player

Record any **manual JSON edits** in a `data/manual-overrides.md` log so you can replay them if you ever re-ingest from source.

### C.4 Handle uniqueness check

Add a one-off script (or do it by eye for ~50 files):
```
node -e "
  const fs = require('fs');
  const handles = fs.readdirSync('data/predictions')
    .map(f => JSON.parse(fs.readFileSync('data/predictions/'+f)).handle);
  const dupes = handles.filter((h,i) => handles.indexOf(h) !== i);
  console.log(dupes.length ? 'DUPLICATES: ' + dupes.join(', ') : 'All handles unique');
"
```
Resolve duplicates by appending `_2`, `_3` to the JSON files manually.

### C.5 Build initial site

```
npm run build
```

Verify locally that:
- Leaderboard shows all N participants with 0 points
- Each `/me/<token>/` exists and is correct
- `digest.html` renders (will be empty of yesterday-results, that's fine)

### C.6 Deploy + send personal links

Push to main → GH Action deploys.

For each participant, send a personal-link email (this is the only non-automated comms during the tournament — done once):

Use mail-merge in Outlook (or a Power Automate flow if you want it scripted):
```
Subject: World Cup 2026 Predictor — your personal link

Hi <name>,

The leaderboard is live: <SITE URL>

Your personal predictions page (bookmark this — it's only for you):
<SITE URL>/me/<token>/

You'll get a daily leaderboard email each morning during the tournament.

Good luck,
— Varun
```

To generate the per-recipient link list, run:
```
node -e "
  const fs = require('fs');
  fs.readdirSync('data/predictions').forEach(f => {
    const p = JSON.parse(fs.readFileSync('data/predictions/'+f));
    console.log([p.name, p.handle, p.token].join('\\t'));
  });
"
```
Pipe into Excel → mail-merge → Outlook.

### C.7 Acceptance for Phase C
- [ ] N prediction JSONs committed to the repo
- [ ] All handles unique
- [ ] `ingest.log` triaged; warnings either resolved or documented
- [ ] Site deployed with initial zero-point leaderboard
- [ ] Personal-link emails sent
- [ ] At least 3 participants confirm via reply that they received the link and can see their predictions

---

## Phase D — Results integration (do this in parallel with Phase A, well before kickoff)

### D.1 football-data.org account (5 min)

1. Sign up at [football-data.org](https://www.football-data.org/client/register)
2. Verify email → get API token
3. Free tier: 10 requests / minute, the World Cup 2026 competition is `code=WC2026` (or similar — check API once registered)
4. Store the token as a GitHub Actions secret:
   - Repo settings → Secrets and variables → Actions → New secret
   - Name: `FOOTBALL_DATA_TOKEN`
   - Value: <your token>

### D.2 Create `scripts/fetch-results.js`

**Inputs:** date range (default: yesterday). API token from env (`process.env.FOOTBALL_DATA_TOKEN`).

**Logic:**
1. Build URL: `https://api.football-data.org/v4/competitions/WC2026/matches?dateFrom=<Y>&dateTo=<Y>&status=FINISHED`
2. Fetch with header `X-Auth-Token: <token>`
3. For each returned match, map to the result schema:
   - `matchId` = derived from the match's home/away teams and stage — **this is the tricky part**, see D.3
   - `homeScore`, `awayScore` from API's `score.fullTime`
   - `goalsInExtraTime` from `score.extraTime`
   - `shootoutGoals` from `score.penalties`
   - `winner` from API's `score.winner` (HOME / AWAY / DRAW)
   - `actualDate` = the API's `utcDate` trimmed to YYYY-MM-DD
4. Write to `data/results/<YYYY-MM-DD>.json` (overwrite — yesterday's file is canonical)
5. Stash the API's raw response in `data/results/raw/<YYYY-MM-DD>.json` for debugging

### D.3 Match ID resolution (the tricky part)

Group-stage match IDs (`G-A-1` etc.) need to be matched against the API's matches by home + away team. Build a lookup at startup:

```js
const matches = require('../data/fixtures/matches.json');
const byTeams = new Map();
for (const m of matches.filter(m => m.stage === 'group')) {
  byTeams.set(`${m.home}|${m.away}`, m.id);
}
// then in the loop:
const id = byTeams.get(`${apiMatch.homeTeam.code}|${apiMatch.awayTeam.code}`);
```

The API uses 3-letter team codes that should mostly match yours, but **mismatches are guaranteed** — e.g. the API may use "USA" while you use "USA" but for the entry sheet it's "United States". Build a small mapping table in `scripts/team-code-map.js` and iterate during the dress rehearsal.

For knockout matches, the API doesn't know your `R32-01` labelling. Match by stage + the team codes that played; resolve to your match IDs by looking at the bracket structure.

### D.4 Manual override hook

When a result is wrong or the API lags:

1. Edit `data/results/<YYYY-MM-DD>.json` by hand
2. Add a marker `"manualOverride": true` to that match
3. Commit and push — site rebuilds automatically

The fetcher must respect this: if `manualOverride === true`, don't overwrite that match on the next API fetch.

### D.5 Update the workflow YAML

In `.github/workflows/deploy.yml`, between the `npm ci` and `npm test` steps, add:
```yaml
      - name: Fetch yesterday's results
        env:
          FOOTBALL_DATA_TOKEN: ${{ secrets.FOOTBALL_DATA_TOKEN }}
        run: node scripts/fetch-results.js
      - name: Commit results
        run: |
          git config user.email "actions@github.com"
          git config user.name "GitHub Actions"
          git add data/results/
          git diff --quiet --cached || git commit -m "Auto-fetch results $(date -u +%F)"
          git push
```

Grant the Action push access: `permissions: contents: write` (already set in the deploy workflow — verify).

### D.6 Tests for fetch-results

Tests are tricky because they touch the network. Approach:
- Stub the fetch with a fixture (a saved JSON response from a past WC match-day or pre-tournament friendly)
- Test the mapping logic only — input: stubbed API JSON, output: result-schema JSON
- Manual smoke test against the real API once you have the token

### D.7 Acceptance for Phase D
- [ ] `scripts/fetch-results.js` works on a real (test-mode) API call
- [ ] Mapping tests pass
- [ ] Workflow YAML includes the fetch + commit steps
- [ ] First scheduled run produces a `data/results/<date>.json` file with the correct shape

---

## Phase E — Movers (rank-delta vs yesterday) (1 hr)

### E.1 Archive yesterday's leaderboard

In the build script, before computing today's leaderboard:
```js
const fs = require('fs');
const today = new Date().toISOString().slice(0, 10);
const archivePath = `data/archive/${today}.json`;
if (!fs.existsSync(archivePath) && fs.existsSync('_site/leaderboard.json')) {
  fs.mkdirSync('data/archive', { recursive: true });
  fs.copyFileSync('_site/leaderboard.json', archivePath);
}
```

But to do that, you first need to **emit** `_site/leaderboard.json` from the Eleventy build (add a passthrough JSON file or a separate emit step).

### E.2 Compute movers

In `scripts/build-digest.js`:
1. Load today's leaderboard (just computed)
2. Load yesterday's archive: `data/archive/<yesterday>.json`
3. For each player, compute `rankDelta = yesterdayRank - todayRank` (positive = climbed)
4. Top 3 risers: highest positive deltas; top 3 fallers: lowest negative deltas
5. Render in the digest

For day 1 of the tournament there is no "yesterday" — fall back to showing "Tournament just started — rankings stabilise after matchday 1."

### E.3 Acceptance
- [ ] `data/archive/<date>.json` written daily
- [ ] Movers section in digest shows real deltas after day 2 onward

---

## Phase F — Daily digest email automation (1 hr)

### F.1 Decide the trigger pattern

Two viable options:

**F.1.a — Scheduled Power Automate flow (recommended)**
- Triggers on a 24h schedule at 08:30 UK
- Fetches `<site>/digest.html` over HTTP
- Composes an email from your inbox to the participants distribution list

**F.1.b — Webhook from GitHub Action**
- The deploy workflow ends with a `curl` to a Power Automate HTTP trigger
- Power Automate receives, fetches, sends
- Pro: only fires if the build succeeded
- Con: extra moving piece

Use F.1.a for v1 unless you specifically need build-success gating.

### F.2 Build the Power Automate flow

In [make.powerautomate.com](https://make.powerautomate.com):

1. **New flow** → **Scheduled cloud flow** → name: `WC2026 Daily Digest` → starts `2026-06-12 08:30` UK → recurrence every 1 day.
2. **Action 1: HTTP** (premium connector — use the `Invoke an HTTP request` action under HTTP if your tenant allows; if not, use the `Office 365 Outlook` HTTP fallback or skip and inline the digest body via a different mechanism)
   - Method: GET
   - URL: `https://<your-site>/digest.html`
   - Returns the HTML as response body
3. **Action 2: Send an email (V2)** (Office 365 Outlook connector)
   - To: the participants distribution list (semicolon-separated; build this once from `data/predictions/*.json` and store it as a flow variable)
   - Subject: `WC2026 Predictor — daily update for ` + `formatDateTime(utcNow(), 'yyyy-MM-dd')`
   - Body: dynamic content from Action 1's response body
   - Is HTML: yes
   - From (Send As) — leave default (your Accenture inbox)
4. **Action 3 (optional): On failure, send self** — error-handling branch that emails you if the HTTP fetch or send fails

### F.3 Recipient list management

Build the list once in C.6 and store it inside the flow as a static variable. If anyone drops out or joins, update the flow manually — there's no reason to automate this for a 5-week game.

### F.4 First send

The flow's first scheduled fire is 12 Jun 08:30. Do a manual test send on 11 Jun (run-flow-now button) to verify everything renders and reaches inboxes.

### F.5 Acceptance for Phase F
- [ ] Flow is built and enabled
- [ ] A test fire delivers a readable digest to your own inbox
- [ ] At least one recipient from each tenant (Accenture, RMG) confirms receipt and rendering

---

## Phase G — Operational hardening (1 hr)

### G.1 Cron timing

Tournament timezone is North America, but participants are UK-based. Set cron to **07:00 UTC** (= 08:00 BST). North American late-night matches finish around 04:00 UTC — by 07:00, all of yesterday's results are in.

### G.2 Manual rebuild trigger

Anyone with repo access can run the GH Action via **Actions tab → Deploy → Run workflow**. Use this to:
- Force a rebuild after editing a result manually
- Re-run after fixing a bug mid-tournament

### G.3 Backup runner

Designate one co-owner who has:
- Repo push access
- Power Automate flow co-ownership (share via `+` icon in the flow editor)
- Access to your M365 mailbox (not literally — they need their own ability to send from a delegated mailbox, or just send from their own inbox using the same body — document this fallback)

### G.4 Pre-tournament dress rehearsal (5 days before kickoff = 6 Jun)

Once Phases A–F are built, do a full dress rehearsal:

1. Take the 5 MVP sample predictions and 5 real-looking ones (10 total).
2. Feed in a real previous matchday's results (e.g. a Euro 2024 group match) through `fetch-results.js` to verify the API works end-to-end.
3. Trigger the GH Action manually.
4. Trigger the Power Automate flow manually.
5. Receive the digest in your inbox — check rendering on desktop Outlook, mobile Outlook, and the Outlook web client.
6. Document any quirks in [lessons.md](lessons.md).

### G.5 Acceptance for Phase G
- [ ] Cron is set to 07:00 UTC
- [ ] Manual rebuild trigger works
- [ ] Backup runner is named and has access
- [ ] Dress rehearsal completed; any issues triaged and resolved before kickoff

---

## Phase H — Tournament window (11 Jun – 19 Jul)

This is the steady-state. ~5 minutes of attention per day.

### H.1 Daily checks (~5 min)

Every morning after the digest goes out:
- [ ] Did the GH Action run successfully? (Email notification on failure if configured, otherwise check Actions tab)
- [ ] Did the digest land in inboxes? (Check your own; any bounces will surface as replies)
- [ ] Spot-check the leaderboard for obvious anomalies (e.g. someone with 200 pts on day 2 implies a scoring bug)
- [ ] Scan `data/results/` for any matches that may have been mis-fetched

See [instructions.md](instructions.md) Daily Ops runbook for the step-by-step.

### H.2 Mid-tournament risks

Already mitigated in design, but be aware:

- **football-data.org down or rate-limited** → manual override: edit `data/results/<date>.json` by hand, push to main
- **A result is wrong** (API errored, e.g. counted an abandoned match) → edit the JSON, set `manualOverride: true`, push
- **A participant complains "my points are wrong"** → ask for their token; pull up their `/me/<token>/`; walk through prediction vs result manually; fix scoring if it's a bug (re-run tests with the new case to prevent regression)
- **Scoring bug discovered** → fix in `score.js`; re-run tests; push; leaderboard auto-corrects on next build
- **Daily email blocked at RMG spam filter** → ask one RMG recipient to whitelist your address; fall back to a manual forward if needed

---

## Phase I — Tournament close + wrap (19 – 22 Jul)

### I.1 Final results

After the Final and 3rd-place match are completed:
1. Confirm `data/results/2026-07-18.json` (3rd-place) and `2026-07-19.json` (Final) are correct
2. Trigger final build manually
3. Apply goal-tiebreaker if needed: set `actualTotalGoals` in the build config (from sum of all results), winner = smallest `tiebreakDelta`. If still tied, prizes split.

### I.2 Reveal full predictions

Now that no further submissions or edits are possible, optionally publish each participant's full prediction sheet — a `/everyone/` page that lists all predictions side-by-side. Useful for closing comms and bragging rights.

### I.3 Wrap-up email

```
Subject: World Cup 2026 Predictor — final results

The tournament's over. Final leaderboard: <site URL>

Top 3:
1. <handle> — <points>
2. <handle> — <points>
3. <handle> — <points>

<Tie-breaker note if applicable>

Thanks for playing.
— Varun
```

### I.4 Post-mortem

Add a section to [lessons.md](../tasks/lessons.md):
- What worked
- What didn't
- What you'd change for the next tournament
- Final cost (free, in this build)
- Engagement metrics (digest open rate if you can measure it, drop-offs, etc.)

### I.5 Archive

- Tag the repo: `git tag v1.0-tournament-final && git push --tags`
- Optionally archive the GH repo (Settings → Danger Zone → Archive)
- Power Automate flow: turn off (don't delete — useful template for next year)
- football-data.org subscription: leave free tier as-is

---

## Pre-launch checklist (run this on 10 Jun evening)

Everything below must be ✅ before tournament kickoff.

### Site & code
- [ ] All MVP tests pass: `npm test`
- [ ] Deployed site loads
- [ ] All N participants have a `/me/<token>/` page
- [ ] `robots.txt` reachable
- [ ] No personal data (full names, emails) in any committed file

### Data
- [ ] `data/predictions/*.json` count matches submitted-files count
- [ ] All handles unique
- [ ] `ingest.log` triaged; manual overrides documented in `data/manual-overrides.md`
- [ ] `data/results/` is empty or only contains an initial placeholder

### Automation
- [ ] GH Actions deploy workflow runs on push
- [ ] GH Actions deploy workflow runs on cron at 07:00 UTC
- [ ] `FOOTBALL_DATA_TOKEN` secret is set
- [ ] `scripts/fetch-results.js` succeeds in a manual test run against the real API
- [ ] Power Automate flow is enabled and has run successfully in a test send

### People
- [ ] All registered participants have received their personal-link email
- [ ] At least 3 participants have confirmed via reply
- [ ] Backup runner has access (repo, flow co-ownership)
- [ ] Non-submitters from registration have been notified they're dropped

### Comms
- [ ] Kickoff-day announcement is drafted and ready to send 11 Jun morning
- [ ] Daily digest sender address is whitelisted by at least one RMG recipient as a test

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| football-data.org returns wrong or delayed result | Med | Med | Manual override via `manualOverride: true` in results JSON |
| RMG inboxes spam-filter the daily digest | Med | High | Sender = your Accenture inbox; whitelist test in pre-launch; manual forward fallback |
| Owner unavailable mid-tournament | Low | High | Backup runner with full access |
| GH Pages outage | Low | Med | Static HTML is cached by visitors' browsers; outage shorter than 24h is invisible to most |
| Power Automate fails to send | Low | Med | Failure-branch email to you; manual send fallback |
| Late registrant requests entry after deadline | High | Low | Communicated upfront; no exceptions |
| Subtle scoring bug discovered mid-tournament | Med | High | Pure-function scoring + tests; fix once, all leaderboards auto-correct on next build |
| Personal `/me/` URL accidentally shared | Med | Low | Capability URLs are individual; one leak = one player only; leaderboard never reveals predictions |
| Participant edits team-name cells in Excel | Low | High | Template signature check fails ingestion loudly |
| Tournament structure surprise (e.g. team disqualified mid-tournament) | Very low | Med | Scoring is data-driven from results; no team-disqualification logic needed because the API will simply stop reporting that team |
