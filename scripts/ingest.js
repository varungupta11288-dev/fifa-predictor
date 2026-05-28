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
const ENV_PATH = path.join(__dirname, '..', '.env');

// Tiny .env loader. Avoids a dotenv dependency. Only loads KEY=VAL lines;
// existing process.env values win (so a shell export overrides .env).
function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

function getSecret() {
  const s = process.env.PREDICTOR_SECRET;
  if (!s || s === 'replace-with-32-bytes-of-random-hex') {
    throw new Error('PREDICTOR_SECRET is not set. Copy .env.example to .env and fill in a real value.');
  }
  return s;
}

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
const EMAIL_CELL = 'T3';    // top-left of merged T3:U3 (input below name)
const HANDLE_CELL = 'W3';   // top-left of merged W3:X3 (input right of email)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Template-signature anchors — fail loudly if any of these have been edited.
const TEMPLATE_SIGNATURE = {
  A4: 'GROUP A',
  G4: 'GROUP B',
  A5: 'Mexico',
  S3: 'EMAIL',
  V3: 'HANDLE',
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

// Token is purely email-derived: same email → same token, every time.
// The secret salt means an attacker can't compute a token from a leaked email alone.
function makeToken(email, secret = getSecret()) {
  return crypto.createHash('sha256').update(`${secret}|${email.toLowerCase()}`).digest('hex').slice(0, 32);
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
function ingestWorkbook(wb, sourceFile, submittedAt = new Date(), secret = getSecret()) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error(`${sourceFile}: workbook has no sheets`);

  verifyTemplateSignature(ws, sourceFile);

  const nameRaw = cellValue(ws, NAME_CELL);
  const name = nameRaw == null ? '' : String(nameRaw).trim();
  if (!name) throw new Error(`${sourceFile}: ${NAME_CELL} (participant name) is empty`);

  const emailRaw = cellValue(ws, EMAIL_CELL);
  const email = emailRaw == null ? '' : String(emailRaw).trim().toLowerCase();
  if (!email) throw new Error(`${sourceFile}: ${EMAIL_CELL} (email) is empty — required to generate a stable URL token`);

  const warnings = [];
  if (!EMAIL_RE.test(email)) {
    warnings.push(`Email at ${EMAIL_CELL} doesn't look valid: "${email}". Token will still be generated; verify with the player before sharing their link.`);
  }

  const handleRaw = cellValue(ws, HANDLE_CELL);
  const handleFromSheet = handleRaw == null ? '' : String(handleRaw).trim();
  let handle;
  let handleSource;
  if (handleFromSheet) {
    handle = makeHandle(handleFromSheet);
    handleSource = 'sheet';
    if (handle !== handleFromSheet.toLowerCase()) {
      warnings.push(`Handle "${handleFromSheet}" normalized to "${handle}" (lowercased, non-alphanumeric → _)`);
    }
  } else {
    handle = makeHandle(name);
    handleSource = 'derived';
    warnings.push(`Handle cell ${HANDLE_CELL} is blank; derived "${handle}" from participant name`);
  }

  const token = makeToken(email, secret);

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
    handleSource,
    name,
    email,
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
  const original = prediction.handle;
  let h = original;
  let i = 2;
  while (takenHandles.has(h)) {
    h = `${original}_${i++}`;
  }
  takenHandles.add(h);
  prediction.handle = h;
  // Two player-chosen handles colliding is a real conflict worth flagging —
  // email the affected player to pick something else. Derived handles can collide
  // benignly (two Alex Bs) and we just disambiguate silently below.
  if (h !== original && prediction.handleSource === 'sheet') {
    prediction.warnings.push(`Handle "${original}" was already taken; auto-renamed to "${h}". Player likely needs to be told.`);
  }
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

  // Pass 1: ingest every file, then deduplicate by email — newest mtime wins.
  // Files that fail signature/email validation are surfaced as errors and skipped.
  const ingested = [];
  let errCount = 0;
  for (const file of files) {
    const full = path.join(SUBMISSIONS_DIR, file);
    try {
      const pred = ingestFile(full);
      ingested.push({ pred, mtime: fs.statSync(full).mtime.getTime() });
    } catch (err) {
      errCount++;
      console.log(`[ERR]  ${file}: ${err.message}`);
    }
  }

  // Deduplicate by email: keep the newest, log the rest as superseded.
  const winnersByEmail = new Map();   // email → { pred, mtime }
  const supersededByEmail = new Map(); // email → [sourceFile, ...]
  for (const entry of ingested) {
    const email = entry.pred.email;
    const existing = winnersByEmail.get(email);
    if (!existing) {
      winnersByEmail.set(email, entry);
    } else if (entry.mtime > existing.mtime) {
      (supersededByEmail.get(email) || supersededByEmail.set(email, []).get(email)).push(existing.pred.sourceFile);
      winnersByEmail.set(email, entry);
    } else {
      (supersededByEmail.get(email) || supersededByEmail.set(email, []).get(email)).push(entry.pred.sourceFile);
    }
  }
  for (const [email, files] of supersededByEmail) {
    const winner = winnersByEmail.get(email).pred.sourceFile;
    const winnerEntry = winnersByEmail.get(email);
    winnerEntry.pred.warnings.push(`Superseded earlier submissions for ${email}: ${files.join(', ')} (kept ${winner}, newest mtime)`);
  }

  // Pass 2: clear stale prediction JSONs (so old tokens don't linger if a player resubmits with a corrected email).
  for (const f of fs.readdirSync(PREDICTIONS_DIR)) {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(PREDICTIONS_DIR, f));
  }

  // Pass 3: assign unique handles + write outputs.
  const takenHandles = new Set();
  const winners = [...winnersByEmail.values()].sort((a, b) => a.pred.sourceFile.localeCompare(b.pred.sourceFile));
  for (const { pred } of winners) {
    ensureUniqueHandle(pred, takenHandles);
    const outPath = path.join(PREDICTIONS_DIR, `${pred.token}.json`);
    fs.writeFileSync(outPath, JSON.stringify(pred, null, 2) + '\n');
    console.log(formatLog(pred));
    for (const w of pred.warnings) console.log(`       - ${w}`);
  }

  const okCount = winners.length;
  console.log(`\n${okCount}/${files.length} files processed (${errCount} errors, ${ingested.length - winners.length} superseded by newer submissions).`);
  if (errCount) process.exit(1);
}

if (require.main === module) main();
module.exports = { ingestWorkbook, ingestFile, makeToken, makeHandle, toScore, ensureUniqueHandle };
