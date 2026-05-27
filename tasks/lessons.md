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
