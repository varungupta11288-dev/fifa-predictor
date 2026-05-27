// Build _site/digest.html — a standalone HTML email summarizing yesterday's results, today's
// top 10, and biggest movers. Inline <style> only (most email clients strip linked stylesheets).

const fs = require('fs');
const path = require('path');
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

function buildHtml({ todayDate, baseUrl, yesterdayDate, yesterdayResults, top10, movers }) {
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
    .cta { display: inline-block; background: #0f172a; color: #ffffff !important; padding: 8px 14px; border-radius: 4px; text-decoration: none; font-size: 13px; }
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

    <div class="section" style="text-align: center;">
      <a class="cta" href="${esc(baseUrl)}/">View full leaderboard</a>
    </div>

    <div class="ftr">
      You are receiving this because you entered the WC2026 Predictor. Your private predictions page link was sent at kickoff.
    </div>
  </div>
</body></html>`;
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

  const leaderboard = score(predictions, allResults, fixtures);
  const top10 = leaderboard.slice(0, 10);

  // "Yesterday's" results = most recent results file. (For MVP / one-shot demo, this is just the
  // latest committed day; in production it'd be filtered to one day before "today".)
  const latest = resultFiles[resultFiles.length - 1];
  const yesterdayDate = latest ? latest.file.replace('.json', '') : null;
  const yesterdayResults = latest ? latest.json : [];

  const html = buildHtml({
    todayDate: new Date().toISOString().slice(0, 10),
    baseUrl: process.env.SITE_BASE_URL || '',
    yesterdayDate,
    yesterdayResults,
    top10,
    movers: null, // populated from a previous run snapshot in production
  });

  if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  console.log(`[OK] Wrote ${path.relative(ROOT, outPath)} (${html.length} bytes, ${top10.length}-player top 10)`);
}

if (require.main === module) main();
module.exports = { buildHtml };
