# WC2026 Predictor — Implementation Proposal

**Owner:** Varun Gupta · **Drafted:** 2026-05-27 · **Tournament window:** 11 Jun – 19 Jul 2026
**Audience:** Accenture + RMG colleagues (~50 expected, scalable to ~100)

## 1. One-paragraph summary

A FIFA World Cup 2026 predictor game for Accenture + RMG colleagues. Each participant submits one prediction sheet before kickoff (group-stage scores, knockout bracket, winner, goal tie-breaker). For the 5 weeks of the tournament, an automated job fetches each day's results, scores every prediction, rebuilds a static leaderboard site, and emails a daily digest. The site is a public GitHub Pages site that uses unguessable per-user URLs so participants can see their own predictions but not anyone else's. Scoring rules and tournament structure are taken verbatim from `asset/WC2026_Predictor_Game_Rules (v1).docx`.

## 2. End-to-end workflow

### Phase 0 — Setup (pre-registration, ~3 days)
- Create GitHub repo + GitHub Pages config
- Create football-data.org account, generate API key
- Create Microsoft Form for registration (stored in your M365)
- Create OneDrive folder for returned prediction sheets
- Build MVP demo (see §5)

### Phase 1 — Registration (target: launch 30 May → close 6 Jun)
- Announcement via Teams + email DL with link to MS Form
- Form captures: full name, work email, tenant (Accenture/RMG/Other), chosen handle, ack of submission deadline
- Form responses auto-collect to a SharePoint list / Excel
- **Exit criterion:** registration closes 6 Jun 23:59; participant list locked

### Phase 2 — Prediction submission (7 Jun → 10 Jun 23:59)
- Mail-merge the [entry sheet](../asset/) Excel to each registrant from your M365
- Participants fill yellow-highlighted cells, return the file to a OneDrive drop folder (or as email attachment)
- Daily chase emails for non-submitters
- **Exit criterion:** all completed Excels in the drop folder by 10 Jun 23:59; latecomers are dropped

### Phase 3 — Pre-tournament build (10 Jun 23:59 → 11 Jun morning)
- Run `ingest-entries.js` → converts each Excel to `predictions/<token>.json`, where `<token>` is a random 128-bit hex string
- Run `npm run build` → publishes initial site: leaderboard (all zeros), `/me/<token>.html` for each player
- Power Automate sends each participant their personal `/me/` link in a kickoff email
- **Exit criterion:** every participant has confirmed receipt of their link; site live

### Phase 4 — Daily operations (11 Jun → 19 Jul, 39 days)
For each day of the tournament:
1. **08:00 UK** — GitHub Action triggers on cron
2. Action runs `fetch-results.js` → pulls completed matches from football-data.org → commits `results/YYYY-MM-DD.json`
3. Action runs scoring engine: pure function `(predictions[], results[]) → leaderboard`
4. Action runs `npm run build` → republishes site (updated leaderboard, updated `/me/` pages with new points)
5. Action writes `digest.html` (top 10 + biggest movers + yesterday's match results) to the site
6. Action commits & deploys
7. **08:30 UK** — Power Automate flow fires, fetches `digest.html`, emails to the participant DL from your M365 inbox
8. **Manual oversight (~5 min/day):** spot-check leaderboard, manually override `results/*.json` if a match is mis-fetched (e.g., abandoned, awarded)

### Phase 5 — Tournament close (19–22 Jul)
- After Final + 3rd-place match, run scoring one final time
- Publish final leaderboard, apply goal tie-breaker if needed
- Optionally reveal everyone's full prediction sheets (now safe to expose since betting window is over)
- Send wrap-up email, announce winner(s)

## 3. Dependencies

### 3.1 Accounts & services
| Item | Purpose | Cost | Owner |
|---|---|---|---|
| GitHub account | Repo, Pages hosting, Actions runner | Free | Varun |
| [football-data.org](https://www.football-data.org) free tier | Match results API | Free (10 req/min) | Varun |
| Microsoft 365 (Accenture) | MS Forms · Power Automate · OneDrive · sending email | Existing | Varun |
| Custom domain *(optional)* | Friendlier URL than `*.github.io` | ~£10/yr | Optional |

### 3.2 Technical stack
| Component | Tech | Notes |
|---|---|---|
| Static site generator | Eleventy (11ty) | Implied by existing scaffold |
| Styling | Tailwind CSS | Implied by existing scaffold |
| Scoring engine | Plain Node.js | Pure function, golden-file tested against rules-doc examples |
| Entry ingestion | Node + `xlsx` library | One-off script, run after submission window closes |
| Results fetcher | Node + `fetch` (native in Node 18+) | Runs daily inside GitHub Action |
| Email send | Power Automate flow | Sends from Varun's M365 inbox for best deliverability |
| CI/CD | GitHub Actions | Cron-scheduled workflow |

### 3.3 Skills required
- Node.js / JavaScript — intermediate
- Eleventy + Tailwind — basic
- GitHub Actions YAML — basic
- Power Automate flow building — basic
- Excel/xlsx parsing — basic

### 3.4 Sign-offs needed from leads
1. **Public-repo OK?** Confirm using a public GitHub repo (no Accenture IP, only game logic + pseudonymous handles + match results) is acceptable.
2. **Email sending from Accenture inbox OK?** Confirm that scripting a daily HTML email to ~50–100 mixed-tenant recipients via Power Automate from `varun.j.gupta@accenture.com` is within acceptable use.
3. **Prize / entry fee policy.** Free-for-fun, or is there a pot? Affects messaging only, not build.
4. **Comms channel.** Which Teams channel or DL hosts the launch announcement?

## 4. Architecture at a glance

```
┌──────────────┐   one-off    ┌──────────────────┐
│ Excel sheets │ ───────────► │ predictions/*.json│ ──┐  committed to repo
│ (OneDrive)   │  ingest      │  (one per player) │   │
└──────────────┘              └──────────────────┘   │
                                                      ▼
┌─────────────────┐  daily   ┌─────────────────────────────┐   build    ┌────────────────────┐
│ football-data.org│ ───────► │ results/YYYY-MM-DD.json     │ ─────────► │ GitHub Pages site  │
│  (API)           │  cron    │ + scoring engine            │  Eleventy  │  · leaderboard     │
└─────────────────┘          │ + /me/<token>.html per user │            │  · /me/<token>     │
                              │ + digest.html                │            │  · digest.html     │
                              └─────────────────────────────┘            └─────────┬──────────┘
                                                                                    │
                                                                          08:30 UK  ▼
                                                                  ┌──────────────────────────┐
                                                                  │ Power Automate (M365)    │
                                                                  │ fetch digest → email DL  │
                                                                  └──────────────────────────┘
```

## 5. MVP demo scope (~1 day's work)

Goal: prove the data flow end-to-end before committing to the full build.

| Included | Excluded |
|---|---|
| 5 fake players with sample predictions | Real registration / MS Form |
| Hardcoded results for matchday 1 (3 matches) | Live football-data.org integration |
| Scoring engine with unit tests on rules-doc examples | Power Automate (digest is generated, sent manually for demo) |
| Public leaderboard page | Custom domain |
| One sample `/me/<token>.html` page | Per-user kickoff email |
| Sample `digest.html` shown alongside | |
| Deployed to a throwaway `*.github.io` URL | |

Demonstrates to leads: the data path, scoring correctness, the "see your own / not theirs" silo, and the look-and-feel of the daily email — enough to make a confident go/no-go decision on the full build.

## 6. Timeline (today is 2026-05-27, kickoff 2026-06-11 = 15 days out)

| Date | Milestone |
|---|---|
| 2026-05-27 | Proposal shared with leads |
| 2026-05-28 → 05-29 | MVP demo built |
| 2026-05-30 | MVP review with leads → go/no-go |
| 2026-05-30 | Registration launched (MS Form goes live) |
| 2026-06-06 | Registration closes |
| 2026-06-07 → 06-10 | Predictions collected & ingested; personal links emailed |
| 2026-06-10 23:59 | **Hard cutoff** — site frozen |
| 2026-06-11 | Tournament kickoff; first daily digest sent morning of 12 Jun |
| 2026-07-19 | Final |
| 2026-07-20 → 07-22 | Wrap-up, winner announced |

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Late registrants / submissions | Hard deadlines communicated upfront; no exceptions |
| football-data.org returns wrong / delayed result | Manual override: edit `results/*.json`, push, site rebuilds |
| RMG inboxes spam-filter the daily digest | Sender = your Accenture inbox (best reputation); monitor bounces in first 3 days; fall back to manual forward if needed |
| Owner unavailable (holiday, illness) mid-tournament | Designate a backup who can re-trigger GH Action and Power Automate flow; document recovery steps in repo `README` |
| Personal `/me/` URL accidentally shared | Capability URLs are individual — one leak only exposes one player; the leaderboard never reveals predictions |
| Scoring bug discovered mid-tournament | Scoring is a pure function; fix once, rerun against all historical data, leaderboard self-corrects |

## 8. Open questions for leads

1. Sign-offs in §3.4 — any blockers?
2. Should the leaderboard show full names *or* handles only? (Recommendation: handles, with name shown only on each user's own `/me/` page.)
3. Is a winner announcement / shoutout on a wider Accenture/RMG comms channel desired?
4. Do we want a Slack/Teams "mini-board" mirror of the leaderboard, in addition to the daily email?
