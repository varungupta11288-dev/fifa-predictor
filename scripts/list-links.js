// Print Name | Handle | Email | Link for every ingested prediction,
// and also write the table to data/links/YYYY-MM-DD.md so you have a
// dated snapshot to copy into mail clients.
//
//   npm run links                 # default: deployed site
//   SITE_URL=http://localhost:8080 npm run links
//
// Same-day re-runs overwrite the day's file. data/links/ is gitignored.

const fs = require('fs');
const path = require('path');

const DEFAULT_SITE = 'https://varungupta11288-dev.github.io/fifa-predictor';
const PREDICTIONS_DIR = path.join(__dirname, '..', 'data', 'predictions');
const LINKS_DIR = path.join(__dirname, '..', 'data', 'links');

function buildTable(rows) {
  const widths = {
    name:   Math.max('Player'.length, ...rows.map(r => r.name.length)),
    handle: Math.max('Handle'.length, ...rows.map(r => r.handle.length)),
    email:  Math.max('Email'.length,  ...rows.map(r => r.email.length)),
    url:    Math.max('Link'.length,   ...rows.map(r => r.url.length)),
  };
  const lines = [];
  const header = [
    'Player'.padEnd(widths.name),
    'Handle'.padEnd(widths.handle),
    'Email'.padEnd(widths.email),
    'Link'.padEnd(widths.url),
  ];
  const sep = Object.values(widths).map(w => '-'.repeat(w));
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${sep.join(' | ')} |`);
  for (const r of rows) {
    lines.push(`| ${r.name.padEnd(widths.name)} | ${r.handle.padEnd(widths.handle)} | ${r.email.padEnd(widths.email)} | ${r.url.padEnd(widths.url)} |`);
  }
  return lines.join('\n');
}

function main() {
  const site = (process.env.SITE_URL || DEFAULT_SITE).replace(/\/$/, '');

  if (!fs.existsSync(PREDICTIONS_DIR)) {
    console.error(`No predictions directory at ${path.relative(process.cwd(), PREDICTIONS_DIR)} — run \`npm run ingest\` first.`);
    process.exit(1);
  }

  const files = fs.readdirSync(PREDICTIONS_DIR).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) {
    console.error('No predictions found — run `npm run ingest` first.');
    process.exit(1);
  }

  const rows = files.map(f => {
    const p = JSON.parse(fs.readFileSync(path.join(PREDICTIONS_DIR, f), 'utf8'));
    return {
      name: p.name,
      handle: p.handle,
      email: p.email || '(missing)',
      url: `${site}/me/${p.token}/`,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const table = buildTable(rows);
  console.log(table);
  console.log(`\n${rows.length} player(s). Leaderboard: ${site}/`);

  // Persist a dated snapshot to data/links/YYYY-MM-DD.md.
  if (!fs.existsSync(LINKS_DIR)) fs.mkdirSync(LINKS_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  const outPath = path.join(LINKS_DIR, `${today}.md`);
  const body = `# Player links — ${today}\n\nGenerated at ${stamp} against ${site}/.\n\n${table}\n\n${rows.length} player(s).\n`;
  fs.writeFileSync(outPath, body);
  console.log(`\nWrote ${path.relative(process.cwd(), outPath)}`);
}

if (require.main === module) main();
