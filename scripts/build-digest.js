// Build _site/digest.html — a standalone HTML email summarizing yesterday's results, today's
// top 10, and biggest movers. Inline <style> only (most email clients strip linked stylesheets).
//
// Pass --outlook (or -o) to also copy the digest to the clipboard and open Outlook Classic
// with the email composed and ready to send (Windows-only; uses the Outlook COM object).

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { score } = require('./score');

const ROOT = path.join(__dirname, '..');

function loadJsonDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => ({ file: f, json: JSON.parse(fs.readFileSync(path.join(dir, f))) }));
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtml({ todayDate, yesterdayDate, yesterdayResults, top10, movers }) {
  const css = `
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 24px; }
    .wrap { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
    .hdr { background: #0f172a; color: #ffffff; padding: 16px 20px; }
    .hdr h1 { margin: 0; font-size: 18px; }
    .hdr .sub { font-size: 13px; opacity: 0.75; }
    .section { padding: 16px 20px; border-top: 1px solid #e2e8f0; }
    .section:first-of-type { border-top: 0; }
    h2 { font-size: 14px; margin: 0 0 10px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.04em; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #f1f5f9; }
    th { background: #f8fafc; font-weight: 600; }
    td.r, th.r { text-align: right; }
    .muted { color: #64748b; font-size: 12px; }
    .ftr { padding: 14px 20px; font-size: 11px; color: #64748b; background: #f8fafc; }
  `;

  const ydayRows = yesterdayResults.length === 0
    ? '<tr><td colspan="3" class="muted">No matches recorded for that date.</td></tr>'
    : yesterdayResults.map(r => `
        <tr>
          <td>${esc(r.home)} v ${esc(r.away)}</td>
          <td class="r">${r.homeScore}–${r.awayScore}</td>
          <td>${r.winner ? esc(r.winner) : '<span class="muted">Draw</span>'}</td>
        </tr>`).join('');

  const top10Rows = top10.map((e, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(e.handle)}</td>
      <td class="r"><strong>${e.totalPoints}</strong></td>
    </tr>`).join('');

  const moversBlock = movers
    ? `<table>
         <thead><tr><th>↑ Risers</th><th class="r">Δ</th><th>↓ Fallers</th><th class="r">Δ</th></tr></thead>
         <tbody>${movers.rows}</tbody>
       </table>`
    : `<p class="muted">Movers will populate from tomorrow once we have two days of results to compare.</p>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>WC2026 Predictor — ${esc(todayDate)}</title><style>${css}</style></head>
<body>
  <div class="wrap">
    <div class="hdr">
      <h1>FIFA WC 2026 Predictor — Daily Update</h1>
      <div class="sub">${esc(todayDate)}</div>
    </div>

    <div class="section">
      <h2>Yesterday's results · ${esc(yesterdayDate || '—')}</h2>
      <table>
        <thead><tr><th>Match</th><th class="r">Score</th><th>Winner</th></tr></thead>
        <tbody>${ydayRows}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>Today's top 10</h2>
      <table>
        <thead><tr><th>#</th><th>Player</th><th class="r">Points</th></tr></thead>
        <tbody>${top10Rows}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>Biggest movers</h2>
      ${moversBlock}
    </div>

    <div class="ftr">
      You are receiving this because you entered the WC2026 Predictor. Your private predictions page link was sent at kickoff.
    </div>
  </div>
</body></html>`;
}

// Copy the digest HTML to the clipboard and open Outlook Classic (desktop) with a new
// message whose body is the digest, ready to review and send. Windows-only — drives the
// Outlook.Application COM object via PowerShell. The compose window is shown (Display),
// never auto-sent, so nothing leaves the machine without a human clicking Send.
function openInOutlook(htmlPath, subject) {
  if (process.platform !== 'win32') {
    console.warn('[skip] --outlook is Windows-only (needs Outlook Classic + COM). Skipping.');
    return;
  }
  // Single-quoted PowerShell literals; escape any embedded single quote by doubling it.
  const psPath = htmlPath.replace(/'/g, "''");
  const psSubject = subject.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
$html = Get-Content -Raw -LiteralPath '${psPath}'
try { Set-Clipboard -Value $html } catch { Write-Warning "Clipboard copy failed: $_" }
$outlook = New-Object -ComObject Outlook.Application
$mail = $outlook.CreateItem(0)            # 0 = olMailItem
$mail.Subject = '${psSubject}'
$mail.HTMLBody = $html
$mail.Display($false)                     # open compose window; do not block
`;
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  child.on('error', (err) => {
    console.error(`[err] Could not launch Outlook: ${err.message}`);
  });
  child.on('close', (code) => {
    if (code === 0) console.log('[OK] Digest copied to clipboard and opened in Outlook Classic.');
    else console.error(`[err] Outlook handoff exited with code ${code}. Is Outlook Classic installed?`);
  });
}

function main() {
  const predDir = path.join(ROOT, 'data', 'predictions');
  const resultsDir = path.join(ROOT, 'data', 'results');
  const fixturesDir = path.join(ROOT, 'data', 'fixtures');
  const outPath = path.join(ROOT, '_site', 'digest.html');

  const predictions = loadJsonDir(predDir).map(x => x.json);

  const resultFiles = loadJsonDir(resultsDir);
  const allResults = resultFiles.flatMap(x => x.json);

  const fixtures = ['teams', 'groups', 'matches'].reduce((o, k) => {
    o[k] = JSON.parse(fs.readFileSync(path.join(fixturesDir, `${k}.json`)));
    return o;
  }, {});
  const schedulePath = path.join(fixturesDir, 'schedule.json');
  const scheduleMatches = fs.existsSync(schedulePath)
    ? JSON.parse(fs.readFileSync(schedulePath)).matches
    : null;

  const leaderboard = score(predictions, allResults, fixtures, { scheduleMatches });
  const top10 = leaderboard.slice(0, 10);

  // "Yesterday's" results = most recent results file. (For MVP / one-shot demo, this is just the
  // latest committed day; in production it'd be filtered to one day before "today".)
  const latest = resultFiles[resultFiles.length - 1];
  const yesterdayDate = latest ? latest.file.replace('.json', '') : null;
  const yesterdayResults = latest ? latest.json : [];

  const todayDate = new Date().toISOString().slice(0, 10);
  const html = buildHtml({
    todayDate,
    yesterdayDate,
    yesterdayResults,
    top10,
    movers: null, // populated from a previous run snapshot in production
  });

  if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  console.log(`[OK] Wrote ${path.relative(ROOT, outPath)} (${html.length} bytes, ${top10.length}-player top 10)`);

  // Persist a dated archive outside _site/ (which `npm run clean` wipes) so each day's digest
  // can be reviewed later. Filename carries the date: digests/digest-YYYY-MM-DD.html.
  const archiveDir = path.join(ROOT, 'digests');
  const archivePath = path.join(archiveDir, `digest-${todayDate}.html`);
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(archivePath, html);
  console.log(`[OK] Archived ${path.relative(ROOT, archivePath)}`);

  // `--outlook` (or `-o`): copy the digest + open Outlook Classic with the email ready to send.
  if (process.argv.includes('--outlook') || process.argv.includes('-o')) {
    openInOutlook(outPath, `FIFA WC 2026 Predictor — Daily Update · ${todayDate}`);
  }
}

if (require.main === module) main();
module.exports = { buildHtml };
