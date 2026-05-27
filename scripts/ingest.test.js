// Unit tests for ingest pipeline.
// Tests build .xlsx workbooks in-memory from the canonical template, mutate cells, then ingest.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const path = require('path');
const { ingestWorkbook, makeToken, makeHandle } = require('./ingest');

const TEMPLATE_PATH = path.join(__dirname, '..', 'asset', 'WC2026_Predictor_Entry_Sheet (v1).xlsx');

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
  // 32 R32 picks
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

const FIXED_DATE = new Date('2026-06-08T14:00:00Z');

// --- Tests ---

test('round-trip: known-good fixture parses all 72 group scores + 32/16/8/4/2/1 KO', () => {
  const wb = loadTemplate();
  setCell(wb, 'U2', 'Test Player', 's');
  fillAllGroupScores(wb, 2, 1);
  fillKnockoutSequence(wb);

  const p = ingestWorkbook(wb, 'test.xlsx', FIXED_DATE);
  assert.equal(p.name, 'Test Player');
  assert.equal(p.handle, 'test_player');
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
  setCell(wb, 'U2', 'Idem Player', 's');
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);

  const p1 = ingestWorkbook(wb, 'idem.xlsx', FIXED_DATE);
  const p2 = ingestWorkbook(wb, 'idem.xlsx', FIXED_DATE);
  assert.equal(JSON.stringify(p1), JSON.stringify(p2));
});

test('fuzzy match: "Brasil" resolves to BRA + warning', () => {
  const wb = loadTemplate();
  setCell(wb, 'U2', 'Typo Tester', 's');
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);
  setCell(wb, 'U8', 'Brasil', 's'); // override first R32 cell

  const p = ingestWorkbook(wb, 'typo.xlsx', FIXED_DATE);
  assert.equal(p.round32[0], 'BRA');
  const aliasWarn = p.warnings.find(w => w.includes('Brasil'));
  assert.ok(aliasWarn, 'expected alias-match warning for "Brasil"');
});

test('unresolvable: "Atlantis" produces warning + slot dropped', () => {
  const wb = loadTemplate();
  setCell(wb, 'U2', 'Bad Tester', 's');
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);
  setCell(wb, 'U8', 'Atlantis', 's');

  const p = ingestWorkbook(wb, 'bad.xlsx', FIXED_DATE);
  const warn = p.warnings.find(w => w.includes('Unresolvable'));
  assert.ok(warn, 'expected unresolvable warning');
  assert.equal(p.round32.length, 31); // one fewer pick since Atlantis couldn't resolve
});

test('missing name: U2 empty → throws error with filename', () => {
  const wb = loadTemplate();
  // Don't set U2 — template already has it empty.
  assert.throws(() => ingestWorkbook(wb, 'noname.xlsx', FIXED_DATE), /noname\.xlsx/);
});

test('template signature mismatch: editing A5 → throws signature error', () => {
  const wb = loadTemplate();
  setCell(wb, 'U2', 'Tamperer', 's');
  setCell(wb, 'A5', 'TamperedTeam', 's');
  assert.throws(() => ingestWorkbook(wb, 'tampered.xlsx', FIXED_DATE), /Template signature mismatch/);
});

test('inconsistent bracket: team in QF but not R16 → warning', () => {
  const wb = loadTemplate();
  setCell(wb, 'U2', 'Inconsistent', 's');
  fillAllGroupScores(wb);
  fillKnockoutSequence(wb);
  // Replace one QF pick with a team not in R16 (Argentina — not in our R16 list since we only took the first 16 R32s)
  setCell(wb, 'U38', 'Argentina', 's');
  // And drop it from R32 too so bracket inconsistency triggers cleanly
  setCell(wb, 'U8', 'Argentina', 's'); // put ARG in R32 so it's only QF-not-R16 that's inconsistent

  const p = ingestWorkbook(wb, 'incon.xlsx', FIXED_DATE);
  const w = p.warnings.find(w => /Bracket inconsistency.*ARG/.test(w));
  assert.ok(w, `expected bracket inconsistency warning, got: ${JSON.stringify(p.warnings)}`);
});

test('token determinism: same name+filename → same token', () => {
  const t1 = makeToken('Alex Bennett', 'Player1_Alex.xlsx');
  const t2 = makeToken('Alex Bennett', 'Player1_Alex.xlsx');
  assert.equal(t1, t2);
  assert.equal(t1.length, 32);
  assert.match(t1, /^[a-f0-9]{32}$/);
});

test('handle: spaces/diacritics/punct collapse to underscores', () => {
  assert.equal(makeHandle('Varun Gupta'), 'varun_gupta');
  assert.equal(makeHandle("O'Brien"), 'o_brien');
  assert.equal(makeHandle('José Müller'), 'jose_muller');
});
