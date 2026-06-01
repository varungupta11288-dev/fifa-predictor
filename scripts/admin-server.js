// Local admin console for ingesting .xlsx submissions, running the deploy,
// and pushing code changes to main. Loopback-only; auth via a per-boot token.
//
//   npm run admin
//
// Routes:
//   GET  /                serves admin.html with the token injected
//   GET  /api/list        { submissions, git }
//   POST /api/upload      { name, base64 } -> data/submissions/<name>
//   POST /api/remove      { name } -> deletes data/submissions/<name>
//   GET  /api/deploy      SSE stream of `npm run deploy`
//   GET  /api/links       SSE stream of `npm run links`
//   GET  /api/fetch-schedule  SSE stream of `npm run fetch:schedule`
//   GET  /api/digest      SSE stream of `npm run build:digest`
//   GET  /api/digests     { latest, archives } — list of built digests
//   GET  /digest          serves the latest _site/digest.html (token-gated)
//   GET  /digests/<file>  serves a dated archive from digests/ (token-gated)
//   POST /api/git-push    { message } -> git add -u; commit; push origin main
//
// All /api/* require the per-boot token. POST bodies + JSON; SSE endpoints
// take the token as ?token=... since EventSource can't set headers.

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
const SUBMISSIONS_DIR = path.join(ROOT, 'data', 'submissions');
const DIGEST_DIR = path.join(ROOT, 'digests');
const LATEST_DIGEST = path.join(ROOT, '_site', 'digest.html');
const HOST = '127.0.0.1';
const PORT = 5174;
const ORIGIN = `http://${HOST}:${PORT}`;
const HTML_PATH = path.join(__dirname, 'admin.html');
const FAVICON_PATH = path.join(ROOT, 'asset', 'Trophy.webp');

const TOKEN = crypto.randomBytes(24).toString('hex');

// ---- helpers ----------------------------------------------------------------

function sanitizeFilename(name) {
  if (typeof name !== 'string') return null;
  if (!/^[A-Za-z0-9._-]+\.xlsx$/.test(name)) return null;
  if (name.includes('..')) return null;
  return name;
}

function tokensMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function assertRepoRoot() {
  const ok = fs.existsSync(path.join(ROOT, 'package.json'))
    && fs.existsSync(path.join(ROOT, 'src', '_data'));
  if (!ok) {
    console.error(`[admin] Refusing to start — not in repo root: ${ROOT}`);
    process.exit(1);
  }
}

function jsonResponse(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req, limitBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function originAllowed(req) {
  const o = req.headers.origin;
  if (!o) return true; // same-origin fetches don't send Origin
  return o === ORIGIN;
}

function authorize(req, url) {
  const fromHeader = req.headers['x-admin-token'];
  const fromQuery = url.searchParams.get('token');
  return tokensMatch(fromHeader || fromQuery || '', TOKEN);
}

// ---- git + fs queries -------------------------------------------------------

function execGit(args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code ?? 1) : 0, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

async function gitState() {
  const [branchRes, statusRes, aheadRes] = await Promise.all([
    execGit(['rev-parse', '--abbrev-ref', 'HEAD']),
    execGit(['status', '--porcelain']),
    execGit(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']),
  ]);
  const branch = branchRes.stdout.trim() || '(detached)';
  const files = statusRes.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      // Porcelain format: "XY path"; for renames "XY orig -> new"
      const m = l.match(/^(..)\s+(.*)$/);
      if (!m) return { status: '??', path: l };
      const pathPart = m[2].includes(' -> ') ? m[2].split(' -> ').pop() : m[2];
      return { status: m[1], path: pathPart };
    });
  let ahead = 0;
  let behind = 0;
  if (aheadRes.code === 0 && aheadRes.stdout.trim()) {
    const [a, b] = aheadRes.stdout.trim().split(/\s+/).map((n) => parseInt(n, 10) || 0);
    ahead = a;
    behind = b;
  }
  return { branch, files, ahead, behind, hasUpstream: aheadRes.code === 0 };
}

async function listSubmissions() {
  if (!fs.existsSync(SUBMISSIONS_DIR)) return [];
  const names = await fsp.readdir(SUBMISSIONS_DIR);
  const rows = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.xlsx')) continue;
    try {
      const st = await fsp.stat(path.join(SUBMISSIONS_DIR, name));
      rows.push({ name, size: st.size, mtime: st.mtime.toISOString() });
    } catch (_) {
      // skip
    }
  }
  rows.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return rows;
}

const DIGEST_NAME_RE = /^digest-\d{4}-\d{2}-\d{2}\.html$/;

async function listDigests() {
  if (!fs.existsSync(DIGEST_DIR)) return [];
  const names = await fsp.readdir(DIGEST_DIR);
  const rows = [];
  for (const name of names) {
    if (!DIGEST_NAME_RE.test(name)) continue;
    try {
      const st = await fsp.stat(path.join(DIGEST_DIR, name));
      rows.push({ name, date: name.slice('digest-'.length, -'.html'.length), mtime: st.mtime.toISOString() });
    } catch (_) {
      // skip
    }
  }
  rows.sort((a, b) => b.name.localeCompare(a.name)); // newest date first
  return rows;
}

async function serveHtmlFile(res, filePath) {
  try {
    const buf = await fsp.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  } catch (_) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Digest not found — run “Daily digest” first.');
  }
}

// ---- streaming command runner (SSE) -----------------------------------------

function streamCommand(res, cmd, args) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    for (const line of payload.split('\n')) res.write(`data: ${line}\n`);
    res.write('\n');
  };

  sendEvent('start', { cmd, args });

  // On Windows, npm is npm.cmd; use shell:true narrowly for npm runs.
  const isWin = process.platform === 'win32';
  const useShell = isWin && cmd === 'npm';
  const child = spawn(cmd, args, { cwd: ROOT, shell: useShell });

  child.stdout.on('data', (buf) => sendEvent('stdout', buf.toString('utf8')));
  child.stderr.on('data', (buf) => sendEvent('stderr', buf.toString('utf8')));

  child.on('error', (err) => {
    sendEvent('stderr', `Failed to spawn: ${err.message}\n`);
    sendEvent('end', { code: -1 });
    res.end();
  });

  child.on('close', (code) => {
    sendEvent('end', { code });
    res.end();
  });

  res.on('close', () => {
    if (!child.killed && child.exitCode === null) child.kill();
  });
}

// ---- request routing --------------------------------------------------------

async function handle(req, res) {
  const url = new URL(req.url, ORIGIN);

  if (req.method === 'GET' && url.pathname === '/') {
    const html = await fsp.readFile(HTML_PATH, 'utf8');
    const injected = html.replace('__ADMIN_TOKEN__', TOKEN);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(injected),
      'Cache-Control': 'no-store',
    });
    res.end(injected);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/favicon.webp') {
    try {
      const buf = await fsp.readFile(FAVICON_PATH);
      res.writeHead(200, {
        'Content-Type': 'image/webp',
        'Content-Length': buf.length,
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(buf);
    } catch (_) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
    return;
  }

  // Digest viewing — token-gated (the digest embeds player handles/standings). Opened in a new
  // browser tab via ?token=..., since these are navigations, not fetch() calls.
  if (req.method === 'GET' && url.pathname === '/digest') {
    if (!authorize(req, url)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Bad token');
      return;
    }
    return serveHtmlFile(res, LATEST_DIGEST);
  }

  if (req.method === 'GET' && url.pathname.startsWith('/digests/')) {
    if (!authorize(req, url)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Bad token');
      return;
    }
    const name = decodeURIComponent(url.pathname.slice('/digests/'.length));
    if (!DIGEST_NAME_RE.test(name)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    return serveHtmlFile(res, path.join(DIGEST_DIR, name));
  }

  if (!url.pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  if (!originAllowed(req)) return jsonResponse(res, 403, { error: 'Bad Origin' });
  if (!authorize(req, url)) return jsonResponse(res, 403, { error: 'Bad token' });

  if (req.method === 'GET' && url.pathname === '/api/list') {
    const [submissions, git] = await Promise.all([listSubmissions(), gitState()]);
    return jsonResponse(res, 200, { submissions, git });
  }

  if (req.method === 'POST' && url.pathname === '/api/upload') {
    let body;
    try { body = await readJsonBody(req); }
    catch (err) { return jsonResponse(res, 400, { error: `Bad body: ${err.message}` }); }
    const name = sanitizeFilename(body.name);
    if (!name) return jsonResponse(res, 400, { error: 'Filename rejected (must match [A-Za-z0-9._-]+.xlsx)' });
    if (typeof body.base64 !== 'string') return jsonResponse(res, 400, { error: 'Missing base64' });
    const target = path.resolve(SUBMISSIONS_DIR, name);
    if (path.dirname(target) !== path.resolve(SUBMISSIONS_DIR)) {
      return jsonResponse(res, 400, { error: 'Path escapes data/submissions/' });
    }
    let buf;
    try { buf = Buffer.from(body.base64, 'base64'); }
    catch (_) { return jsonResponse(res, 400, { error: 'Invalid base64' }); }
    if (!buf.length) return jsonResponse(res, 400, { error: 'Empty file' });
    if (buf.length > 5 * 1024 * 1024) return jsonResponse(res, 400, { error: 'File too large (>5MB)' });
    await fsp.mkdir(SUBMISSIONS_DIR, { recursive: true });
    await fsp.writeFile(target, buf);
    return jsonResponse(res, 200, { ok: true, name, size: buf.length });
  }

  if (req.method === 'POST' && url.pathname === '/api/remove') {
    let body;
    try { body = await readJsonBody(req); }
    catch (err) { return jsonResponse(res, 400, { error: `Bad body: ${err.message}` }); }
    const name = sanitizeFilename(body.name);
    if (!name) return jsonResponse(res, 400, { error: 'Filename rejected' });
    const target = path.resolve(SUBMISSIONS_DIR, name);
    if (path.dirname(target) !== path.resolve(SUBMISSIONS_DIR)) {
      return jsonResponse(res, 400, { error: 'Path escapes data/submissions/' });
    }
    try { await fsp.unlink(target); }
    catch (err) {
      if (err.code === 'ENOENT') return jsonResponse(res, 404, { error: 'Not found' });
      throw err;
    }
    return jsonResponse(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/deploy') {
    return streamCommand(res, 'npm', ['run', 'deploy']);
  }

  if (req.method === 'GET' && url.pathname === '/api/links') {
    return streamCommand(res, 'npm', ['run', 'links']);
  }

  if (req.method === 'GET' && url.pathname === '/api/fetch-schedule') {
    return streamCommand(res, 'npm', ['run', 'fetch:schedule']);
  }

  if (req.method === 'GET' && url.pathname === '/api/digest') {
    return streamCommand(res, 'npm', ['run', 'build:digest']);
  }

  if (req.method === 'GET' && url.pathname === '/api/digests') {
    const archives = await listDigests();
    return jsonResponse(res, 200, { latest: fs.existsSync(LATEST_DIGEST), archives });
  }

  if (req.method === 'POST' && url.pathname === '/api/git-push') {
    let body;
    try { body = await readJsonBody(req); }
    catch (err) { return jsonResponse(res, 400, { error: `Bad body: ${err.message}` }); }
    const message = (body.message || '').toString().trim();
    if (!message) return jsonResponse(res, 400, { error: 'Commit message required' });
    if (message.length > 500) return jsonResponse(res, 400, { error: 'Commit message too long' });

    const steps = [];
    const add = await execGit(['add', '-u']);
    steps.push({ step: 'git add -u', ...add });
    if (add.code !== 0) return jsonResponse(res, 500, { ok: false, steps });

    const status = await execGit(['status', '--porcelain']);
    if (!status.stdout.trim()) {
      return jsonResponse(res, 200, { ok: true, steps, note: 'Nothing to commit (working tree clean after add -u).' });
    }

    const commit = await execGit(['commit', '-m', message]);
    steps.push({ step: 'git commit', ...commit });
    if (commit.code !== 0) return jsonResponse(res, 500, { ok: false, steps });

    const branchRes = await execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = branchRes.stdout.trim() || 'main';
    const push = await execGit(['push', 'origin', branch]);
    steps.push({ step: `git push origin ${branch}`, ...push });
    if (push.code !== 0) return jsonResponse(res, 500, { ok: false, steps });

    return jsonResponse(res, 200, { ok: true, steps });
  }

  jsonResponse(res, 404, { error: 'Not found' });
}

// ---- boot -------------------------------------------------------------------

function openBrowser(target) {
  const cmd = process.platform === 'win32' ? 'cmd'
    : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', target] : [target];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', () => { /* user can open manually */ });
  child.unref();
}

function main() {
  assertRepoRoot();
  if (!fs.existsSync(HTML_PATH)) {
    console.error(`[admin] Missing ${path.relative(ROOT, HTML_PATH)}`);
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error('[admin] handler error:', err);
      if (!res.headersSent) jsonResponse(res, 500, { error: err.message });
      else res.end();
    });
  });

  server.listen(PORT, HOST, () => {
    const url = `${ORIGIN}/?token=${TOKEN}`;
    console.log(`\n  WC2026 admin → ${url}\n`);
    console.log('  Ctrl-C to stop.\n');
    openBrowser(url);
  });

  const shutdown = () => {
    console.log('\n[admin] shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) main();

module.exports = { sanitizeFilename, tokensMatch };
