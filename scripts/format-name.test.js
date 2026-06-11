const assert = require('node:assert');
const test = require('node:test');
const { titleCaseName } = require('./format-name');

test('all-caps names become Title Case', () => {
  assert.strictEqual(titleCaseName('SOUMIK MAITY'), 'Soumik Maity');
  assert.strictEqual(titleCaseName('ANIL ANANDA SUPUGADE'), 'Anil Ananda Supugade');
});

test('already-correct names are unchanged (idempotent)', () => {
  assert.strictEqual(titleCaseName('Abhineet Mathur'), 'Abhineet Mathur');
  assert.strictEqual(titleCaseName('Juan Miguel Ramos Pugnaire'), 'Juan Miguel Ramos Pugnaire');
  assert.strictEqual(titleCaseName(titleCaseName('SOUMIK MAITY')), 'Soumik Maity');
});

test('trailing single-letter initials stay capitalised', () => {
  assert.strictEqual(titleCaseName('Ratheesh Kumar I S'), 'Ratheesh Kumar I S');
  assert.strictEqual(titleCaseName('Ajay Kumar M'), 'Ajay Kumar M');
});

test('hyphenated parts are title-cased per segment', () => {
  assert.strictEqual(titleCaseName('SMITH-JONES'), 'Smith-Jones');
  assert.strictEqual(titleCaseName('mary-jane watson'), 'Mary-Jane Watson');
});

test('extra whitespace is collapsed and trimmed', () => {
  assert.strictEqual(titleCaseName('  jeff   kahlon  '), 'Jeff Kahlon');
});

test('non-string input passes through', () => {
  assert.strictEqual(titleCaseName(undefined), undefined);
  assert.strictEqual(titleCaseName(null), null);
});
