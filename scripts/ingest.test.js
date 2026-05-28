// Unit tests for ingest pipeline.
// Tests build .xlsx workbooks in-memory from the canonical template, mutate cells, then ingest.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const path = require('path');
const { ingestWorkbook, makeToken, makeHandle, ensureUniqueHandle } = require('./ingest');

const TEMPLATE_PATH = path.join(__dirname, '..', 'asset', 'WC2026_Predictor_Entry_Sheet (v1).xlsx');
const TEST_SECRET = 'test-secret-do-not-use-in-prod';
const FIXED_DATE = new Date('2026-06-08T14:00:00Z');

function loadTemplate() {
  return XLSX.readFile(TEMPLATE_PATH);
}

function setCell(wb, ref, value, type = 's') {
  const ws = wb.Sheets[wb.SheetNames[0]];
  ws[ref] = { t: type, v: value };
  const decoded = XLSX.utils.decode_range(ws['!ref']);
  const cell = XLSX.utils.decode_cell(ref);
  decoded.e.r = Math.max(decoded.e.r, cell.r);
  decoded.e.c = Math.max(decoded.e.c, cell.c);
  ws['!ref'] = XLSX.utils.encode_range(decoded);
}

function setIdentity(wb, { name, email, handle } = {}) {
  if (name !== undefined) setCell(wb, 'U2', name, 's');
  if (email !== undefined) setCell(wb, 'T3', email, 's');
  if (handle !== undefined) setCell(wb, 'W3', handle, 's');
}

function ingest(wb, file = 'test.xlsx', date = FIXED_DATE) {
  return ingestWorkbook(wb, file, date, TEST_SECRET);
}

function fillAllGroupScores(wb, h = 1, a = 0) {
  const blocks = [
    { rows: [5,6,7,8,9,10],     hc: 'B', ac: 'D' },
    { rows: [5,6,7,8,9,10],     hc: 'H', ac: 'J' },
    { rows: [5,6,7,8,9,10],     hc: 'N', ac: 'P' },
    { rows: [14,15,16,17,18,19], hc: 'B', ac: 'D' },
    { rows: [14,15,16,17,18,19], hc: 'H', ac: 'J' },
    { rows: [14,15,16,17,18,19], hc: 'N', ac: 'P' },
    { rows: [23,24,25,26,27,28], hc: 'B', ac: 'D' },
    { rows: [23,24,25,26,27,28], hc: 'H', ac: 'J' },
    { rows: [23,24,25,26,27,28], hc: 'N', ac: 'P' },
    { rows: [32,33,34,35,36,37], hc: 'B', ac: 'D' },
    { rows: [32,33,34,35,36,37], hc: 'H', ac: 'J' },
    { rows: [32,33,34,35,36,37], hc: 'N', ac: 'P' },
  ];
  for (const b of blocks) for (const r of b.rows) {
    setCell(wb, b.hc + r, h, 'n');
    setCell(wb, b.ac + r, a, 'n');
  }
}

function fillKnockoutSequence(wb) {
  const r32 = ['Mexico','South Korea','Czechia','South Africa','Canada','Qatar','Switzerland','Bosnia & Herz.','Brazil','Haiti','Scotland','Morocco','United States','Australia','Turkiye','Paraguay','Germany','Ivory Coast','Ecuador','Curacao','Netherlands','Sweden','Tunisia','Japan','Belgium','Iran','New Zealand','Egypt','Spain','Saudi Arabia','Uruguay','Cape Verde'];
  const r32Refs = [...range('U',8,23), ...range('X',8,23)];
  r32.forEach((t, i) => setCell(wb, r32Refs[i], t, 's'));

  const r16 = r32.slice(0, 16);
  const r16Refs = [...range('U',27,34), ...range('X',27,34)];
  r16.forEach((t, i) => setCell(wb, r16Refs[i], t, 's'));

  const qf = r16.slice(0, 8);
  const qfRefs = [...range('U',38,41), ...range('X',38,41)];
  qf.forEach((t, i) => setCell(wb, qfRefs[i], t, 's'));

  const sf = qf.slice(0, 4);
  const sfRefs = [...range('U',45,46), ...range('X',45,46)];
  sf.forEach((t, i) => setCell(wb, sfRefs[i], t, 's'));

  const fin = sf.slice(0, 2);
  setCell(wb, 'U50', fin[0], 's');
  setCell(wb, 'U51', fin[1], 's');

  setCell(wb, 'X54', 'Brazil', 's');
  setCell(wb, 'X57', 165, 'n');
}

function range(letter, start, end) {
  const out = []; for (let r = start; r <= end; r++) out.push(`${letter}${r}`); return out;
}

// --- Tests ---

test('round-trip: known-good fixture parses all 72 group scores + 32/16/8/4/2/1 KO', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'Test Player', email: 'test@example.com', handle: 'tester' });
  fillAllGroupScores(wb, 2, 1);
  fillKnockoutSequence(wb);

  const p = ingest(wb);
  assert.equal(p.name, 'Test Player');
  assert.equal(p.email, 'test@example.com');
  assert.equal(p.handle, 'tester');
  assert.equal(p.handleSource, 'sheet');
  assert.equal(Object.keys(p.groupScores).length, 72);
  assert.deepEqual(p.groupScores['G-A-1'], { home: 2, away: 1 });
  assert.equal(p.round32.length, 32);
  assert.equal(p.round16.length, 16);
  assert.equal(p.quarterFinal.length, 8);
  assert.equal(p.semiFinal.length, 4);
  assert.equal(p.final.length, 2);
  assert.equal(p.winner, 'BRA');
  assert.equal(p.tiebreaker, 165);
});

test('idempotency: two ingests of same workbook → byte-identical JSON', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'Idem Player', email: 'idem@example.com', handle: 'idem' });
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);

  const p1 = ingest(wb, 'idem.xlsx');
  const p2 = ingest(wb, 'idem.xlsx');
  assert.equal(JSON.stringify(p1), JSON.stringify(p2));
});

test('fuzzy match: "Brasil" resolves to BRA + warning', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'Typo Tester', email: 'typo@example.com', handle: 'typo' });
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);
  setCell(wb, 'U8', 'Brasil', 's');

  const p = ingest(wb, 'typo.xlsx');
  assert.equal(p.round32[0], 'BRA');
  const aliasWarn = p.warnings.find(w => w.includes('Brasil'));
  assert.ok(aliasWarn, 'expected alias-match warning for "Brasil"');
});

test('unresolvable: "Atlantis" produces warning + slot dropped', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'Bad Tester', email: 'bad@example.com', handle: 'bad' });
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);
  setCell(wb, 'U8', 'Atlantis', 's');

  const p = ingest(wb, 'bad.xlsx');
  const warn = p.warnings.find(w => w.includes('Unresolvable'));
  assert.ok(warn, 'expected unresolvable warning');
  assert.equal(p.round32.length, 31);
});

test('missing name: U2 empty → throws error with filename', () => {
  const wb = loadTemplate();
  setIdentity(wb, { email: 'someone@example.com' });
  assert.throws(() => ingest(wb, 'noname.xlsx'), /noname\.xlsx.*participant name/i);
});

test('missing email: T3 empty → throws error with filename', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'No Email' });
  assert.throws(() => ingest(wb, 'noemail.xlsx'), /noemail\.xlsx.*email/i);
});

test('invalid email format: warning but proceeds', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'Typo Mail', email: 'not-an-email', handle: 'typo_mail' });
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);

  const p = ingest(wb, 'typomail.xlsx');
  assert.equal(p.email, 'not-an-email');
  assert.ok(p.warnings.some(w => w.includes("doesn't look valid")));
});

test('email lowercased: MIXED@Case.com stored as mixed@case.com', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'Case Test', email: 'MIXED@Case.COM', handle: 'mc' });
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);

  const p = ingest(wb, 'case.xlsx');
  assert.equal(p.email, 'mixed@case.com');
});

test('handle from sheet wins over derived', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'Long Name Here', email: 'h@example.com', handle: 'rocky' });
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);

  const p = ingest(wb, 'h.xlsx');
  assert.equal(p.handle, 'rocky');
  assert.equal(p.handleSource, 'sheet');
});

test('handle blank: derived from name with warning', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'Derived Name', email: 'd@example.com' });
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);

  const p = ingest(wb, 'd.xlsx');
  assert.equal(p.handle, 'derived_name');
  assert.equal(p.handleSource, 'derived');
  assert.ok(p.warnings.some(w => w.includes('blank') && w.includes('derived')));
});

test('handle normalized: "Rocky Star!" → "rocky_star" with warning', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'X', email: 'x@example.com', handle: 'Rocky Star!' });
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);

  const p = ingest(wb, 'norm.xlsx');
  assert.equal(p.handle, 'rocky_star');
  assert.ok(p.warnings.some(w => w.includes('normalized')));
});

test('template signature mismatch: editing A5 → throws signature error', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'Tamperer', email: 'tamper@example.com', handle: 't' });
  setCell(wb, 'A5', 'TamperedTeam', 's');
  assert.throws(() => ingest(wb, 'tampered.xlsx'), /Template signature mismatch/);
});

test('signature checks email + handle label cells (S3, V3)', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'X', email: 'x@example.com', handle: 'x' });
  setCell(wb, 'S3', 'NOT_EMAIL', 's');
  assert.throws(() => ingest(wb, 'badlabel.xlsx'), /Template signature mismatch/);
});

test('inconsistent bracket: team in QF but not R16 → warning', () => {
  const wb = loadTemplate();
  setIdentity(wb, { name: 'Inconsistent', email: 'i@example.com', handle: 'i' });
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);
  setCell(wb, 'U38', 'Argentina', 's');
  setCell(wb, 'U8', 'Argentina', 's');

  const p = ingest(wb, 'incon.xlsx');
  const w = p.warnings.find(w => /Bracket inconsistency.*ARG/.test(w));
  assert.ok(w, `expected bracket inconsistency warning, got: ${JSON.stringify(p.warnings)}`);
});

test('token determinism: same email → same token regardless of filename', () => {
  const t1 = makeToken('alex@example.com', TEST_SECRET);
  const t2 = makeToken('alex@example.com', TEST_SECRET);
  assert.equal(t1, t2);
  assert.equal(t1.length, 32);
  assert.match(t1, /^[a-f0-9]{32}$/);
});

test('token: email case-insensitive (Alex@Example.com == alex@example.com)', () => {
  const t1 = makeToken('Alex@Example.com', TEST_SECRET);
  const t2 = makeToken('alex@example.com', TEST_SECRET);
  assert.equal(t1, t2);
});

test('token: same name different emails → different tokens (collision-free)', () => {
  const t1 = makeToken('alex1@example.com', TEST_SECRET);
  const t2 = makeToken('alex2@example.com', TEST_SECRET);
  assert.notEqual(t1, t2);
});

test('token: changing the secret produces a different token (salt works)', () => {
  const t1 = makeToken('alex@example.com', 'secret-a');
  const t2 = makeToken('alex@example.com', 'secret-b');
  assert.notEqual(t1, t2);
});

test('handle: spaces/diacritics/punct collapse to underscores', () => {
  assert.equal(makeHandle('Varun Gupta'), 'varun_gupta');
  assert.equal(makeHandle("O'Brien"), 'o_brien');
  assert.equal(makeHandle('José Müller'), 'jose_muller');
});

test('ensureUniqueHandle: collision between two sheet handles → warning on the loser', () => {
  const taken = new Set();
  const p1 = { handle: 'rocky_star', handleSource: 'sheet', warnings: [] };
  const p2 = { handle: 'rocky_star', handleSource: 'sheet', warnings: [] };
  ensureUniqueHandle(p1, taken);
  ensureUniqueHandle(p2, taken);
  assert.equal(p1.handle, 'rocky_star');
  assert.equal(p2.handle, 'rocky_star_2');
  assert.equal(p1.warnings.length, 0);
  assert.ok(p2.warnings.some(w => w.includes('auto-renamed')));
});

test('ensureUniqueHandle: derived-handle collision → silent disambiguation, no warning', () => {
  const taken = new Set();
  const p1 = { handle: 'alex_b', handleSource: 'derived', warnings: [] };
  const p2 = { handle: 'alex_b', handleSource: 'derived', warnings: [] };
  ensureUniqueHandle(p1, taken);
  ensureUniqueHandle(p2, taken);
  assert.equal(p1.handle, 'alex_b');
  assert.equal(p2.handle, 'alex_b_2');
  assert.equal(p2.warnings.length, 0);
});
