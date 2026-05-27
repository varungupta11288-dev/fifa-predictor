// Generate 5 sample filled prediction sheets from the canonical template.
// Each participant has deliberately varied picks so the leaderboard differentiates after
// matchday 1. One participant types "Brasil" instead of "Brazil" to exercise the fuzzy match.
//
//   npm run generate-samples
//
// Outputs into data/submissions/. Idempotent: re-running overwrites the same files byte-for-byte
// (we fix mtime to a deterministic timestamp).

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', 'asset', 'WC2026_Predictor_Entry_Sheet (v1).xlsx');
const OUT_DIR = path.join(__dirname, '..', 'data', 'submissions');

// Group score cell map mirrors ingest.js — keep in sync.
const GROUP_BLOCKS = [
  { letter: 'A', rows: [5, 6, 7, 8, 9, 10],     homeScoreCol: 'B', awayScoreCol: 'D' },
  { letter: 'B', rows: [5, 6, 7, 8, 9, 10],     homeScoreCol: 'H', awayScoreCol: 'J' },
  { letter: 'C', rows: [5, 6, 7, 8, 9, 10],     homeScoreCol: 'N', awayScoreCol: 'P' },
  { letter: 'D', rows: [14, 15, 16, 17, 18, 19], homeScoreCol: 'B', awayScoreCol: 'D' },
  { letter: 'E', rows: [14, 15, 16, 17, 18, 19], homeScoreCol: 'H', awayScoreCol: 'J' },
  { letter: 'F', rows: [14, 15, 16, 17, 18, 19], homeScoreCol: 'N', awayScoreCol: 'P' },
  { letter: 'G', rows: [23, 24, 25, 26, 27, 28], homeScoreCol: 'B', awayScoreCol: 'D' },
  { letter: 'H', rows: [23, 24, 25, 26, 27, 28], homeScoreCol: 'H', awayScoreCol: 'J' },
  { letter: 'I', rows: [23, 24, 25, 26, 27, 28], homeScoreCol: 'N', awayScoreCol: 'P' },
  { letter: 'J', rows: [32, 33, 34, 35, 36, 37], homeScoreCol: 'B', awayScoreCol: 'D' },
  { letter: 'K', rows: [32, 33, 34, 35, 36, 37], homeScoreCol: 'H', awayScoreCol: 'J' },
  { letter: 'L', rows: [32, 33, 34, 35, 36, 37], homeScoreCol: 'N', awayScoreCol: 'P' },
];

const KO_REFS = {
  round32:      [...col('U', 8, 23), ...col('X', 8, 23)],
  round16:      [...col('U', 27, 34), ...col('X', 27, 34)],
  quarterFinal: [...col('U', 38, 41), ...col('X', 38, 41)],
  semiFinal:    [...col('U', 45, 46), ...col('X', 45, 46)],
  final:        [`U50`, `U51`],
};

function col(letter, startRow, endRow) {
  const out = [];
  for (let r = startRow; r <= endRow; r++) out.push(`${letter}${r}`);
  return out;
}

function setCell(ws, ref, value, type = 's') {
  ws[ref] = { t: type, v: value };
  // Expand !ref if needed
  if (ws['!ref']) {
    const decoded = XLSX.utils.decode_range(ws['!ref']);
    const cellAddr = XLSX.utils.decode_cell(ref);
    decoded.e.r = Math.max(decoded.e.r, cellAddr.r);
    decoded.e.c = Math.max(decoded.e.c, cellAddr.c);
    ws['!ref'] = XLSX.utils.encode_range(decoded);
  }
}

// Tiny seeded RNG so generated picks are deterministic.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function fillGroupScores(ws, rng) {
  for (const block of GROUP_BLOCKS) {
    for (const row of block.rows) {
      const h = Math.floor(rng() * 4);
      const a = Math.floor(rng() * 4);
      setCell(ws, block.homeScoreCol + row, h, 'n');
      setCell(ws, block.awayScoreCol + row, a, 'n');
    }
  }
}

function fillKnockouts(ws, picks) {
  for (const [stage, teams] of Object.entries(picks)) {
    const refs = KO_REFS[stage];
    teams.forEach((team, i) => {
      if (i < refs.length && team) setCell(ws, refs[i], team, 's');
    });
  }
}

// Pre-baked sample participants. Names → realistic mix.
// One ("Carl Sanchez") deliberately picks "Brasil" to test the fuzzy matcher.
const SAMPLES = [
  {
    file: 'Player1_Alex.xlsx',
    name: 'Alex Bennett',
    seed: 11,
    knockouts: {
      round32: ['Mexico','South Korea','Czechia','South Africa','Canada','Qatar','Switzerland','Bosnia & Herz.','Brazil','Haiti','Scotland','Morocco','United States','Australia','Turkiye','Paraguay','Germany','Ivory Coast','Ecuador','Curacao','Netherlands','Sweden','Tunisia','Japan','Belgium','Iran','New Zealand','Egypt','Spain','Saudi Arabia','Uruguay','Cape Verde'],
      round16: ['Mexico','Czechia','Canada','Switzerland','Brazil','Morocco','United States','Paraguay','Germany','Ecuador','Netherlands','Japan','Belgium','New Zealand','Spain','Uruguay'],
      quarterFinal: ['Mexico','Canada','Brazil','United States','Germany','Netherlands','Belgium','Spain'],
      semiFinal: ['Brazil','United States','Germany','Spain'],
      final: ['Brazil','Spain'],
    },
    winner: 'Brazil',
    tiebreaker: 145,
  },
  {
    file: 'Player2_Bea.xlsx',
    name: 'Bea Okafor',
    seed: 22,
    knockouts: {
      round32: ['Mexico','South Korea','Czechia','South Africa','Canada','Qatar','Switzerland','Bosnia & Herz.','Brazil','Haiti','Scotland','Morocco','United States','Australia','Turkiye','Paraguay','Germany','Ivory Coast','Ecuador','Curacao','Netherlands','Sweden','Tunisia','Japan','Belgium','Iran','New Zealand','Egypt','Spain','Saudi Arabia','Uruguay','Cape Verde'],
      round16: ['South Korea','South Africa','Qatar','Bosnia & Herz.','Haiti','Scotland','Australia','Turkiye','Ivory Coast','Curacao','Sweden','Tunisia','Iran','Egypt','Saudi Arabia','Cape Verde'],
      quarterFinal: ['South Korea','Qatar','Haiti','Australia','Curacao','Sweden','Iran','Saudi Arabia'],
      semiFinal: ['South Korea','Haiti','Curacao','Iran'],
      final: ['Haiti','Iran'],
    },
    winner: 'Iran',
    tiebreaker: 178,
  },
  {
    file: 'Player3_Carl.xlsx',
    name: 'Carl Sanchez',
    seed: 33,
    knockouts: {
      round32: ['Mexico','South Korea','Czechia','South Africa','Canada','Qatar','Switzerland','Bosnia & Herz.','Brasil','Haiti','Scotland','Morocco','United States','Australia','Turkiye','Paraguay','Germany','Ivory Coast','Ecuador','Curacao','Netherlands','Sweden','Tunisia','Japan','Belgium','Iran','New Zealand','Egypt','Spain','Saudi Arabia','Uruguay','Cape Verde'],
      round16: ['Mexico','South Korea','Canada','Switzerland','Brasil','Scotland','United States','Turkiye','Germany','Ecuador','Netherlands','Tunisia','Belgium','Iran','Spain','Uruguay'],
      quarterFinal: ['Mexico','Switzerland','Brasil','United States','Germany','Netherlands','Belgium','Spain'],
      semiFinal: ['Brasil','United States','Germany','Spain'],
      final: ['Brasil','Germany'],
    },
    winner: 'Brasil',
    tiebreaker: 162,
  },
  {
    file: 'Player4_Dani.xlsx',
    name: 'Dani Park',
    seed: 44,
    knockouts: {
      round32: ['Mexico','South Korea','Czechia','South Africa','Canada','Qatar','Switzerland','Bosnia & Herz.','Brazil','Haiti','Scotland','Morocco','United States','Australia','Turkiye','Paraguay','France','Iraq','Norway','Senegal','Argentina','Austria','Jordan','Algeria','Portugal','Uzbekistan','DR Congo','Colombia','England','Ghana','Panama','Croatia'],
      round16: ['Mexico','Czechia','Canada','Switzerland','Brazil','Morocco','United States','Turkiye','France','Norway','Argentina','Algeria','Portugal','Colombia','England','Croatia'],
      quarterFinal: ['Czechia','Canada','Brazil','United States','France','Argentina','Portugal','England'],
      semiFinal: ['Brazil','France','Argentina','England'],
      final: ['Argentina','England'],
    },
    winner: 'Argentina',
    tiebreaker: 155,
  },
  {
    file: 'Player5_Eli.xlsx',
    name: 'Eli Johansson',
    seed: 55,
    knockouts: {
      round32: ['Mexico','Czechia','South Africa','South Korea','Canada','Switzerland','Bosnia & Herz.','Qatar','Brazil','Morocco','Haiti','Scotland','United States','Paraguay','Australia','Turkiye','Germany','Ecuador','Curacao','Ivory Coast','Netherlands','Japan','Tunisia','Sweden','Belgium','Egypt','Iran','New Zealand','Spain','Uruguay','Saudi Arabia','Cape Verde'],
      round16: ['Mexico','Czechia','Canada','Switzerland','Brazil','Morocco','United States','Paraguay','Germany','Ecuador','Netherlands','Japan','Belgium','Egypt','Spain','Uruguay'],
      quarterFinal: ['Czechia','Switzerland','Brazil','Paraguay','Germany','Japan','Egypt','Spain'],
      semiFinal: ['Brazil','Germany','Paraguay','Spain'],
      final: ['Germany','Spain'],
    },
    winner: 'Germany',
    tiebreaker: 192,
  },
];

function generate() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const sample of SAMPLES) {
    const wb = XLSX.readFile(TEMPLATE_PATH);
    const ws = wb.Sheets[wb.SheetNames[0]];
    setCell(ws, 'U2', sample.name, 's');
    fillGroupScores(ws, makeRng(sample.seed));
    fillKnockouts(ws, sample.knockouts);
    setCell(ws, 'X54', sample.winner, 's');
    setCell(ws, 'X57', sample.tiebreaker, 'n');
    const outPath = path.join(OUT_DIR, sample.file);
    XLSX.writeFile(wb, outPath);
    // Fix mtime to keep ingest output deterministic
    const fixedTime = new Date('2026-06-08T14:00:00Z');
    fs.utimesSync(outPath, fixedTime, fixedTime);
    console.log(`[OK] Wrote ${sample.file}`);
  }
}

if (require.main === module) generate();
module.exports = { generate, SAMPLES };
