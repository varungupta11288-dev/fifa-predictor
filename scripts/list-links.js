// Print one share-link per ingested prediction.
//
//   npm run links                 # default: deployed site
//   SITE_URL=http://localhost:8080 npm run links
//
// Reads data/predictions/*.json and emits a Markdown table to stdout.

const fs = require('fs');
const path = require('path');

const DEFAULT_SITE = 'https://varungupta11288-dev.github.io/fifa-predictor';
const PREDICTIONS_DIR = path.join(__dirname, '..', 'data', 'predictions');

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
    return { name: p.name, url: `${site}/me/${p.token}/` };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const nameWidth = Math.max('Player'.length, ...rows.map(r => r.name.length));
  const urlWidth  = Math.max('Link'.length,   ...rows.map(r => r.url.length));

  console.log(`| ${'Player'.padEnd(nameWidth)} | ${'Link'.padEnd(urlWidth)} |`);
  console.log(`| ${'-'.repeat(nameWidth)} | ${'-'.repeat(urlWidth)} |`);
  for (const r of rows) {
    console.log(`| ${r.name.padEnd(nameWidth)} | ${r.url.padEnd(urlWidth)} |`);
  }
  console.log(`\n${rows.length} player(s). Leaderboard: ${site}/`);
}

if (require.main === module) main();
