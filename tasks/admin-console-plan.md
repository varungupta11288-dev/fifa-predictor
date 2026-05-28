# Admin Console — Implementation Plan

One-page local web UI to ingest `.xlsx` submissions, run `npm run deploy`, and push code changes to `main`. Static HTML alone can't do this (no FS or shell access), so this is a tiny Node server bound to `127.0.0.1`, launched via `npm run admin`.

## Decisions (locked)

- **Stack**: Node built-ins only (`http`, `fs/promises`, `child_process`, `crypto`, `url`, `path`). No new npm deps.
- **Port**: `5174` (Vite-ish, unlikely to collide with Eleventy's `8080`).
- **Bind**: `127.0.0.1` only.
- **Auth**: random hex token generated at boot, embedded in served HTML, required on every API request via `X-Admin-Token`.
- **Styling**: inline minimal CSS in `scripts/admin.html` (~80 lines). No Tailwind dependency.
- **Git push scope**: `main` branch code changes only. `npm run deploy` continues to handle `gh-pages`.
- **Upload encoding**: client reads file as base64, POSTs JSON. Files are <100 KB; no multipart parser needed.

## Files

- [ ] `scripts/admin-server.js` (~180 LOC) — server + route handlers + SSE
- [ ] `scripts/admin.html` (~220 LOC) — single page UI, vanilla JS
- [ ] `package.json` — add `"admin": "node scripts/admin-server.js"` script
- [ ] `README.md` — short section documenting `npm run admin`
- [ ] `test/admin-server.test.js` — unit tests for filename sanitizer + token check

## Server routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Serve `admin.html` with token injected |
| GET | `/api/list` | JSON: `{ submissions: [...], git: { branch, dirty, ahead, files: [...] } }` |
| POST | `/api/upload` | Body `{ name, base64 }` → writes to `data/submissions/<name>` |
| POST | `/api/remove` | Body `{ name }` → deletes `data/submissions/<name>` |
| POST | `/api/deploy` | Spawns `npm run deploy`, streams stdout/stderr as SSE |
| POST | `/api/links` | Spawns `npm run links`, returns combined output |
| POST | `/api/git-push` | Body `{ message }` → `git add -u && git commit -m … && git push origin main` |

Every `/api/*` requires header `X-Admin-Token: <token>`. SSE endpoints accept token via query string since EventSource can't set headers.

## Security guardrails

- [ ] Bind `127.0.0.1` (assert in code, never `0.0.0.0`)
- [ ] Refuse to start if CWD lacks `package.json` AND `src/_data/`
- [ ] Filename regex `^[A-Za-z0-9._-]+\.xlsx$`; reject anything with `/`, `\`, `..`
- [ ] `path.resolve` the upload target and assert it's still inside `data/submissions/`
- [ ] `child_process.spawn(cmd, [args], { shell: false })` — no shell interpolation
- [ ] Token compared with `crypto.timingSafeEqual`
- [ ] Reject requests with `Origin` header that isn't `http://127.0.0.1:5174` (defends against rogue local tabs even with token leak)

## UI layout

```
┌─ WC2026 Admin ───────────────────────────────────┐
│ ① Drop entry sheets                              │
│    [ drag/drop or click ]                        │
│    Current: var.xlsx · alex.xlsx · …  [✕]        │
│ ② Build & deploy                                 │
│    Git: main · clean · 0 ahead                   │
│    [🚀 Deploy]  [🔗 Generate links]              │
│    ┌ live log ───────────────────────┐           │
│    │ …                               │           │
│    └─────────────────────────────────┘           │
│ ③ Push code changes to main                      │
│    Modified: src/_data/predictions.js, …         │
│    [ commit message ____________________ ]       │
│    [ git add · commit · push origin main ]       │
└──────────────────────────────────────────────────┘
```

- Drag-drop highlights on `dragover`
- Toast notifications: green for success, red for failure, auto-dismiss 4s
- Deploy button disables itself while running; log auto-scrolls
- Git status auto-refreshes after deploy/push completes

## Acceptance criteria

- [ ] `npm run admin` boots server, prints URL, opens browser (Windows: `start`; mac: `open`; linux: `xdg-open`)
- [ ] Dropping a real submission `.xlsx` writes it to `data/submissions/` with original filename, then it appears in the list
- [ ] Uploading `evil.exe` → 400 error, toast in UI
- [ ] Uploading `../escape.xlsx` → 400 error
- [ ] Hitting `/api/upload` from another tab without the token → 403
- [ ] Deploy button streams the same output you'd see in the terminal and ends with the same exit code
- [ ] After deploy completes, the leaderboard at https://varungupta11288-dev.github.io/fifa-predictor/ reflects new submissions
- [ ] Git push button is disabled when working tree is clean
- [ ] Git push uses `git add -u` (modified tracked files only) — never `-A`; `data/` stays gitignored regardless
- [ ] Existing 35/35 tests still pass; 2-3 new tests added for sanitizer + token

## Test plan

Unit (Vitest):
1. `sanitizeFilename` rejects `../x.xlsx`, `x.exe`, `x.xlsx/y`, `..\\x.xlsx`
2. `sanitizeFilename` accepts `varun_gupta.xlsx`, `alex-chen.v2.xlsx`
3. Token check: equal lengths + mismatched bytes → false; matching → true; different lengths → false

Manual:
1. `npm run admin` → browser opens
2. Drop `data/submissions/_fixture.xlsx` (copy of a real one) → appears in list
3. Click Deploy → log streams, finishes green, gh-pages updated
4. Edit a tracked file (e.g., `README.md`), reload admin → file appears in section ③, type message, push → commit appears on origin/main
5. Ctrl-C server → no orphan child processes

## Out of scope (deliberately)

- Multi-user / authentication beyond loopback + token (single-operator tool)
- File preview / xlsx parsing in the UI (deploy already shows player resolution warnings)
- Undo for deploy (gh-pages is the source of truth post-push)
- Mobile responsive (desktop-only tool)

## Lessons to apply

- Eleventy doesn't clean its output dir (`npm run build` already handles via clean step). Admin's deploy button just calls the existing script; no duplication.
- Git identity: do NOT touch `git config user.email` in the server. Commits inherit whatever is configured (personal account, per lessons.md).
- OneDrive locks: if `git add`/`commit` fails with EBUSY, surface the raw stderr to the UI rather than swallowing it.
