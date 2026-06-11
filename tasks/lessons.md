# Lessons

Patterns from corrections during the build. Read before starting work in this repo.

## Git identity for personal-repo work

**Rule:** Don't assume `git config user.email` from the system environment. Confirm with the user when initialising or before the first commit, especially when the system info shows a work email but the target repo is personal.

**Why:** First push attempt used `varun.j.gupta@accenture.com` (work email surfaced in the harness env). User wanted `varun.gupta11288@gmail.com` for commits to the personal GitHub account hosting the predictor repo.

**How to apply:** For any repo where the remote URL points at a personal account (`/<username>-dev/`, `/personal-...`), pause before the first commit and ask which email to use. Don't run `git config user.email` based on `$userEmail` in the environment alone.

## Tailwind v3 + `@tailwindcss/cli` v4 silently conflict

**Rule:** With `tailwindcss@^3`, do **not** install `@tailwindcss/cli`. The v4 CLI takes over `npx tailwindcss` and ignores the v3 `tailwind.config.js`.

**Why:** Plan §1.2 listed both as dev-deps. The v4 CLI built CSS that worked (because it scanned templates) but used the v4 CSS-based config model — completely bypassing `tailwind.config.js`. Symptom: build "succeeded" but the output header said `tailwindcss v4.3.0` despite v3 being pinned. Future config changes would silently no-op.

**How to apply:** When a project is pinned to Tailwind v3, the CLI ships inside the `tailwindcss` package itself — no separate `@tailwindcss/cli` install. Verify with `npx tailwindcss --help` showing v3 header, or grep for `tailwindcss v3` in the generated CSS comment.

## Nunjucks `{% set %}` does not escape conditional scope

**Rule:** Don't compute per-row scoring values inside Nunjucks templates using `{% set var = ... %}` accumulators inside `{% if %}` / `{% for %}` blocks. Pre-compute in a `_data/*.js` file and pass the structured values to the template.

**Why:** First version of `me.njk` set `pts = 0` outside an if-chain, then tried to reassign inside `{% if %}` branches. Nunjucks scoped the inner `set` locally — the outer variable never updated, every match rendered with 0 points and no highlight class. Fixed by creating `src/_data/playerViews.js` that joins predictions × results × matches and emits `groupRows[].points` and `outcomeClass` ready-to-render.

**How to apply:** Eleventy data files are the right place for any logic that touches more than one input source or branches on state. Keep templates pure presentation: loops + interpolation, no arithmetic, no conditionals deeper than a couple of CSS class swaps.

## OneDrive-synced repo: expect intermittent `git` file-lock failures

**Rule:** When running git operations inside a OneDrive folder, `rebase`, `stash -u`, and `clean` may fail with "permission denied" on transient files (`.git/rebase-merge/`, generated `_site/` subdirs). The git operation usually completed despite the cleanup error.

**Why:** OneDrive holds short-lived locks on files it's syncing. Symptom: `git pull --rebase` said "Successfully rebased" but `Remove-Item _site-static/assets/` returned "Permission denied" mid-stash, and the rebase-merge dir lingered.

**How to apply:** After any failed git verb in this repo, run `git status` to see actual state before assuming the operation failed. If `.git/rebase-merge` (or similar) is the only leftover, `Remove-Item -Recurse -Force` it and continue. Don't `git rebase --abort` based on the error alone — check first.

## Player data is gitignored; deploys happen locally from a `gh-pages` worktree

**Rule:** `data/submissions/`, `data/predictions/`, and `data/roster*.csv` are gitignored. The deployed leaderboard is produced by `npm run deploy` on the operator's machine and pushed to the `gh-pages` branch — CI never has player data.

**Why:** Real player submissions contain email addresses and personal picks. Committing them to a public repo would expose them forever in git history even if later deleted. The MVP architecture (CI builds from main and deploys to Pages) was incompatible with that posture.

**How to apply:**
- Never `git add data/submissions/*` or `data/predictions/*` — the gitignore catches accidents, but resist suggesting them in scripts or docs.
- `src/_data/predictions.js` and `src/_data/playerViews.js` strip `email` and `sourceFile` before exposing prediction objects to templates. Keep that invariant if you add new data loaders.
- The deploy script lives at [scripts/deploy-gh-pages.js](../scripts/deploy-gh-pages.js) and uses `git worktree` (not in-place branch switching) — the OneDrive lock issues above made the in-place pattern flaky.
- GitHub Pages must be configured to **Deploy from a branch → `gh-pages` / (root)**. If a future operator changes it back to "GitHub Actions", the live site will go stale because CI builds with no predictions data.

## Email is the identity key; tokens are salted

**Rule:** Player tokens for `/me/<token>/` URLs are `sha256(PREDICTOR_SECRET + email).slice(0,32)`. Email lives in cell `T3` of the entry sheet. Don't switch back to name-keyed tokens — name collisions (two Alex Rods) silently overwrite each other's predictions.

**Why:** First pass keyed tokens on `name + filename`. Two real risks: two players named "Alex Rodriguez" → same token; and a corrected resubmission with a new filename → new token, old URL breaks. Email is unique and stable. The salt (in `.env`, gitignored) means anyone who knows a player's email can't compute their URL by guessing.

**How to apply:**
- Setup: copy `.env.example` to `.env`, generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Never rotate the secret post-launch — it invalidates every existing per-player URL.
- The sheet, not any external roster, is the source of truth: name (U2), email (T3), handle (W3). MS Forms can't be used as a join (attachment-questions are Accenture-internal-only).
- Resubmissions with the same email overwrite cleanly. `ingest.js` keeps the newest mtime and warns about superseded files. Older .xlsx files in `data/submissions/` should be deleted once you're sure the latest is good — they don't hurt anything but they clutter audit.
- Two players choosing the same handle is auto-disambiguated (`rocky_star_2`) AND logged with a `[WARN]` — email the second player to pick a different one.

## PowerShell `[int]` rounds (banker's), it does not floor

**Rule:** For grid/pixel index math, use `[math]::Floor($idx / $w)`, never `[int]($idx / $w)`.

**Why:** PowerShell `/` returns a double; `[int]` rounds to nearest (banker's rounding), not toward zero. In a flood-fill background cutout this miscomputed the row for ~half the pixels, so the fill cleared only ~half the connected white region — and exited 0 with no error, so it looked like a logic/threshold bug. Wasted two re-runs widening colour predicates before spotting the real cause.

**How to apply:** Any time an integer is derived from division in PowerShell (row = index / width, page = offset / size), wrap in `[math]::Floor(...)`. Symptom of getting it wrong: results that are partially-correct/halved rather than totally broken.
