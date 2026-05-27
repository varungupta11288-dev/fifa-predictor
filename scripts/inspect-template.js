// One-off: print key cells from the entry template so we can validate Appendix A's cell map.
const XLSX = require('xlsx');
const path = require('path');

const file = path.join(__dirname, '..', 'asset', 'WC2026_Predictor_Entry_Sheet (v1).xlsx');
const wb = XLSX.readFile(file);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];

console.log('Sheets:', wb.SheetNames);
console.log('Range:', ws['!ref']);

const cellsToProbe = [
  'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10',
  'B4', 'B5', 'C5', 'D5', 'E5',
  'G4', 'G5', 'H5', 'I5', 'J5', 'K5',
  'M4', 'N5', 'O5', 'P5', 'Q5',
  'A14', 'A15', 'A19',
  'A23', 'A28',
  'A32', 'A37',
  'S6', 'S7',
  'U2', 'V2', 'W2', 'X2',
  'U8', 'U9', 'U23', 'X8', 'X23',
  'U27', 'U34', 'X27', 'X34',
  'U38', 'U41', 'X38', 'X41',
  'U45', 'U46', 'X45', 'X46',
  'U50', 'U51',
  'X54',
  'X57',
];
for (const ref of cellsToProbe) {
  const c = ws[ref];
  console.log(`${ref}: ${c ? JSON.stringify(c.v) : '(empty)'}`);
}

// Also print rows 4..40, columns A..R as a grid
console.log('\n--- GRID rows 4..40 cols A..R ---');
const cols = 'ABCDEFGHIJKLMNOPQR'.split('');
for (let r = 4; r <= 40; r++) {
  const row = cols.map(col => {
    const c = ws[col + r];
    const v = c ? String(c.v).slice(0, 8) : '';
    return v.padEnd(9);
  }).join('|');
  console.log(`r${String(r).padStart(2)}|${row}`);
}
