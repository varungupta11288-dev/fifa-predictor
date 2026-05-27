// Ingest filled .xlsx prediction sheets into normalized JSON.
//
//   npm run ingest
//
// Reads every .xlsx in data/submissions/ and emits data/predictions/<token>.json.
// Idempotent: token = sha256(name + filename), so the same file always maps to the same output.

const XLSX = require('xlsx');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { resolveTeam } = require('./normalize-team');

const SUBMISSIONS_DIR = path.join(__dirname, '..', 'data', 'submissions');
const PREDICTIONS_DIR = path.join(__dirname, '..', 'data', 'predictions');

// Cell map, locked — Appendix A of tasks/mvp-plan.md
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

// Knockout free-text cell map.
const KO_CELLS = {
  round32:      [...col('U', 8, 23), ...col('X', 8, 23)],     // 32 cells
  round16:      [...col('U', 27, 34), ...col('X', 27, 34)],   // 16 cells
  quarterFinal: [...col('U', 38, 41), ...col('X', 38, 41)],   // 8 cells
  semiFinal:    [...col('U', 45, 46), ...col('X', 45, 46)],   // 4 cells
  final:        [`U50`, `U51`],                                // 2 cells
};
const WINNER_CELL = 'X54';
const TIEBREAKER_CELL = 'X57';
const NAME_CELL = 'U2';

// Template-signature anchors — fail loudly if any of these have been edited.
const TEMPLATE_SIGNATURE = {
  A4: 'GROUP A',
  G4: 'GROUP B',
  A5: 'Mexico',
  S6: 'ROUND OF 32  (5 pts per correct team)',
};

function col(letter, startRow, endRow) {
  const out = [];
  for (let r = startRow; r <= endRow; r++) out.push(`${letter}${r}`);
  return out;
}

function cellValue(ws, ref) {
  const c = ws[ref];
  return c == null ? undefined : c.v;
}

function makeToken(name, sourceFile) {
  return crypto.createHash('sha256').update(`${name}|${sourceFile}`).digest('hex').slice(0, 32);
}

function makeHandle(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    || 'player';
}

function verifyTemplateSignature(ws, sourceFile) {
  for (const [ref, expected] of Object.entries(TEMPLATE_SIGNATURE)) {
    const actual = cellValue(ws, ref);
    if (actual !== expected) {
      throw new Error(`Template signature mismatch in ${sourceFile}: ${ref}="${actual}", expected "${expected}". Has the participant edited a non-input cell?`);
    }
  }
}

// Convert a worksheet → prediction object. Pure-ish: returns the object + warnings, no file I/O.
function ingestWorkbook(wb, sourceFile, submittedAt = new Date()) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error(`${sourceFile}: workbook has no sheets`);

  verifyTemplateSignature(ws, sourceFile);

  const nameRaw = cellValue(ws, NAME_CELL);
  const name = nameRaw == null ? '' : String(nameRaw).trim();
  if (!name) throw new Error(`${sourceFile}: ${NAME_CELL} (participant name) is empty`);

  const token = makeToken(name, sourceFile);
  const handle = makeHandle(name);
  const warnings = [];

  // Group scores
  const groupScores = {};
  for (const block of GROUP_BLOCKS) {
    block.rows.forEach((row, i) => {
      const matchId = `G-${block.letter}-${i + 1}`;
      const homeVal = cellValue(ws, block.homeScoreCol + row);
      const awayVal = cellValue(ws, block.awayScoreCol + row);
      const homeNum = toScore(homeVal);
      const awayNum = toScore(awayVal);
      if (homeNum != null && awayNum != null) {
        if (homeNum < 0 || awayNum < 0 || homeNum > 30 || awayNum > 30) {
          warnings.push(`Group score out of plausible range for ${matchId}: ${homeNum}-${awayNum} (cell ${block.homeScoreCol}${row}/${block.awayScoreCol}${row})`);
        }
        groupScores[matchId] = { home: homeNum, away: awayNum };
      } else {
        warnings.push(`Missing group score: ${matchId} (cells ${block.homeScoreCol}${row}, ${block.awayScoreCol}${row})`);
      }
    });
  }

  // Knockout picks
  const expectedCounts = { round32: 32, round16: 16, quarterFinal: 8, semiFinal: 4, final: 2 };
  const ko = {};
  const stageLabels = { round32: 'R32', round16: 'R16', quarterFinal: 'QF', semiFinal: 'SF', final: 'Final' };

  for (const [stageKey, refs] of Object.entries(KO_CELLS)) {
    const picks = [];
    for (const ref of refs) {
      const v = cellValue(ws, ref);
      if (v == null || String(v).trim() === '') continue;
      const resolved = resolveTeam(v);
      if (!resolved) {
        warnings.push(`Unresolvable team name in ${stageLabels[stageKey]} cell ${ref}: "${v}"`);
        continue;
      }
      if (resolved.source === 'fuzzy') {
        warnings.push(`Fuzzy-matched "${v}" → "${resolved.canonical}" in ${stageLabels[stageKey]} cell ${ref}`);
      } else if (resolved.source === 'alias') {
        warnings.push(`Alias-matched "${v}" → "${resolved.canonical}" in ${stageLabels[stageKey]} cell ${ref}`);
      }
      picks.push(resolved.code);
    }
    ko[stageKey] = picks;
    if (picks.length !== expectedCounts[stageKey]) {
      warnings.push(`${stageLabels[stageKey]}: expected ${expectedCounts[stageKey]} picks, got ${picks.length}`);
    }
  }

  // Winner
  let winner = null;
  const winnerVal = cellValue(ws, WINNER_CELL);
  if (winnerVal && String(winnerVal).trim() !== '') {
    const resolved = resolveTeam(winnerVal);
    if (!resolved) {
      warnings.push(`Unresolvable team name in Winner cell ${WINNER_CELL}: "${winnerVal}"`);
    } else {
      if (resolved.source === 'fuzzy') {
        warnings.push(`Fuzzy-matched "${winnerVal}" → "${resolved.canonical}" in Winner cell ${WINNER_CELL}`);
      } else if (resolved.source === 'alias') {
        warnings.push(`Alias-matched "${winnerVal}" → "${resolved.canonical}" in Winner cell ${WINNER_CELL}`);
      }
      winner = resolved.code;
    }
  } else {
    warnings.push(`Missing Winner pick (cell ${WINNER_CELL})`);
  }

  // Bracket consistency: each later stage should ⊆ earlier stage
  const supersets = [
    ['round16', 'round32'],
    ['quarterFinal', 'round16'],
    ['semiFinal', 'quarterFinal'],
    ['final', 'semiFinal'],
  ];
  for (const [inner, outer] of supersets) {
    const outerSet = new Set(ko[outer]);
    for (const team of ko[inner]) {
      if (!outerSet.has(team)) {
        warnings.push(`Bracket inconsistency: ${team} in ${stageLabels[inner]} but not in ${stageLabels[outer]}`);
      }
    }
  }
  if (winner && !ko.final.includes(winner)) {
    warnings.push(`Bracket inconsistency: winner ${winner} not in Final picks`);
  }

  // Tiebreaker
  let tiebreaker = null;
  const tbVal = cellValue(ws, TIEBREAKER_CELL);
  if (tbVal == null || String(tbVal).trim() === '') {
    warnings.push(`Missing tiebreaker (cell ${TIEBREAKER_CELL})`);
  } else {
    const n = toScore(tbVal);
    if (n == null || n < 0 || n > 500) {
      warnings.push(`Tiebreaker out of plausible range (cell ${TIEBREAKER_CELL}): ${tbVal}`);
    } else {
      tiebreaker = n;
    }
  }

  const submittedAtIso = submittedAt instanceof Date ? submittedAt.toISOString() : submittedAt;

  return {
    token,
    handle,
    name,
    submittedAt: submittedAtIso,
    sourceFile,
    groupScores,
    round32: ko.round32,
    round16: ko.round16,
    quarterFinal: ko.quarterFinal,
    semiFinal: ko.semiFinal,
    final: ko.final,
    winner,
    tiebreaker,
    warnings,
  };
}

function toScore(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  const n = Number(String(v).trim());
  return Number.isInteger(n) ? n : null;
}

function ingestFile(filePath) {
  const wb = XLSX.readFile(filePath);
  // Use file mtime as submittedAt so output stays byte-identical across re-runs.
  const stat = fs.statSync(filePath);
  return ingestWorkbook(wb, path.basename(filePath), stat.mtime);
}

function ensureUniqueHandle(prediction, takenHandles) {
  let h = prediction.handle;
  let i = 2;
  while (takenHandles.has(h)) {
    h = `${prediction.handle}_${i++}`;
  }
  takenHandles.add(h);
  prediction.handle = h;
}

function formatLog(p) {
  const groupFilled = Object.keys(p.groupScores).length;
  const ko = `${p.round32.length}/${p.round16.length}/${p.quarterFinal.length}/${p.semiFinal.length}/${p.final.length}/${p.winner ? 1 : 0}`;
  const status = p.warnings.length === 0 ? '[OK]  ' : '[WARN]';
  return `${status} ${p.sourceFile.padEnd(28)} → ${p.handle.padEnd(20)} (${p.token.slice(0,4)}...)  ${groupFilled}/72 group, ${ko} KO, ${p.warnings.length} warning(s)`;
}

function main() {
  if (!fs.existsSync(SUBMISSIONS_DIR)) {
    console.log(`No submissions directory at ${path.relative(process.cwd(), SUBMISSIONS_DIR)} — 0 files processed.`);
    return;
  }
  if (!fs.existsSync(PREDICTIONS_DIR)) fs.mkdirSync(PREDICTIONS_DIR, { recursive: true });

  const files = fs.readdirSync(SUBMISSIONS_DIR)
    .filter(f => f.toLowerCase().endsWith('.xlsx') && !f.startsWith('~$'))
    .sort();

  if (files.length === 0) {
    console.log('0 files processed.');
    return;
  }

  const takenHandles = new Set();
  let errCount = 0;
  for (const file of files) {
    const full = path.join(SUBMISSIONS_DIR, file);
    try {
      const pred = ingestFile(full);
      ensureUniqueHandle(pred, takenHandles);
      const outPath = path.join(PREDICTIONS_DIR, `${pred.token}.json`);
      fs.writeFileSync(outPath, JSON.stringify(pred, null, 2) + '\n');
      console.log(formatLog(pred));
      for (const w of pred.warnings) console.log(`       - ${w}`);
    } catch (err) {
      errCount++;
      console.log(`[ERR]  ${file}: ${err.message}`);
    }
  }
  console.log(`\n${files.length - errCount}/${files.length} files processed successfully.`);
  if (errCount) process.exit(1);
}

if (require.main === module) main();
module.exports = { ingestWorkbook, ingestFile, makeToken, makeHandle, toScore };
