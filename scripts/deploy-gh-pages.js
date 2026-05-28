// Push the built _site/ to the gh-pages branch on origin.
//
//   node scripts/deploy-gh-pages.js
//
// Assumes _site/ has just been produced (npm run deploy does the build first).
// Uses a git worktree so the main branch's working tree is never disturbed —
// safer on OneDrive where in-place branch switching can hit file-lock errors.

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, '_site');
const WORKTREE = path.join(ROOT, '.gh-pages-tmp');
const BRANCH = 'gh-pages';
const REMOTE = 'origin';

function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function runQuiet(cmd, opts = {}) {
  return spawnSync(cmd, { shell: true, cwd: ROOT, ...opts });
}

function copyDir(src, dst) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function main() {
  if (!fs.existsSync(SITE)) {
    console.error('Error: _site/ not found. Run `npm run build` (or `npm run deploy`) first.');
    process.exit(1);
  }

  // Clean any leftover worktree from a previous failed run.
  runQuiet(`git worktree remove --force "${WORKTREE}"`);
  if (fs.existsSync(WORKTREE)) fs.rmSync(WORKTREE, { recursive: true, force: true });

  // Make sure origin/gh-pages is up to date (no-op if the branch doesn't exist yet).
  const fetchResult = runQuiet(`git fetch ${REMOTE} ${BRANCH}`);
  const remoteHasBranch = fetchResult.status === 0;

  if (remoteHasBranch) {
    console.log(`[deploy] Checking out existing ${REMOTE}/${BRANCH} into ${path.basename(WORKTREE)}/`);
    run(`git worktree add "${WORKTREE}" ${REMOTE}/${BRANCH} -B ${BRANCH}`);
  } else {
    console.log(`[deploy] No remote ${BRANCH} branch yet — creating an orphan branch.`);
    run(`git worktree add --detach "${WORKTREE}" HEAD`);
    // Inside the worktree: replace HEAD with a fresh orphan branch.
    execSync(`git checkout --orphan ${BRANCH}`, { stdio: 'inherit', cwd: WORKTREE });
    execSync('git rm -rf .', { stdio: 'pipe', cwd: WORKTREE });
  }

  // Clear the worktree (except .git) and re-populate from _site/.
  for (const f of fs.readdirSync(WORKTREE)) {
    if (f === '.git') continue;
    fs.rmSync(path.join(WORKTREE, f), { recursive: true, force: true });
  }
  copyDir(SITE, WORKTREE);

  // .nojekyll prevents GitHub Pages from running Jekyll over the output —
  // without it, files/folders starting with _ get hidden.
  fs.writeFileSync(path.join(WORKTREE, '.nojekyll'), '');

  // Stage everything in the worktree.
  execSync('git add -A', { stdio: 'inherit', cwd: WORKTREE });

  // Skip the commit + push if nothing changed.
  const diffResult = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: WORKTREE });
  if (diffResult.status === 0) {
    console.log('[deploy] No changes to deploy.');
  } else {
    const ts = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';
    execSync(`git commit -m "deploy ${ts}"`, { stdio: 'inherit', cwd: WORKTREE });
    console.log(`[deploy] Pushing to ${REMOTE}/${BRANCH}...`);
    execSync(`git push ${REMOTE} ${BRANCH}`, { stdio: 'inherit', cwd: WORKTREE });
    console.log('[deploy] Done.');
  }

  // Clean up the worktree.
  runQuiet(`git worktree remove --force "${WORKTREE}"`);
}

if (require.main === module) main();
