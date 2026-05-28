// Unit tests for the admin-server's input guards.
// Run: npm test

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { sanitizeFilename, tokensMatch } = require('./admin-server');

// --- sanitizeFilename ---

test('sanitizeFilename: accepts simple .xlsx names', () => {
  assert.equal(sanitizeFilename('varun_gupta.xlsx'), 'varun_gupta.xlsx');
  assert.equal(sanitizeFilename('alex-chen.v2.xlsx'), 'alex-chen.v2.xlsx');
  assert.equal(sanitizeFilename('A.xlsx'), 'A.xlsx');
});

test('sanitizeFilename: rejects path traversal', () => {
  assert.equal(sanitizeFilename('../escape.xlsx'), null);
  assert.equal(sanitizeFilename('..\\escape.xlsx'), null);
  assert.equal(sanitizeFilename('foo/bar.xlsx'), null);
  assert.equal(sanitizeFilename('foo\\bar.xlsx'), null);
});

test('sanitizeFilename: rejects non-xlsx extensions', () => {
  assert.equal(sanitizeFilename('evil.exe'), null);
  assert.equal(sanitizeFilename('payload.xlsx.exe'), null);
  assert.equal(sanitizeFilename('noext'), null);
  assert.equal(sanitizeFilename('archive.zip'), null);
});

test('sanitizeFilename: rejects double-dot in name even with .xlsx', () => {
  assert.equal(sanitizeFilename('..xlsx'), null);
  assert.equal(sanitizeFilename('a..b.xlsx'), null);
});

test('sanitizeFilename: rejects non-string input', () => {
  assert.equal(sanitizeFilename(null), null);
  assert.equal(sanitizeFilename(undefined), null);
  assert.equal(sanitizeFilename(42), null);
  assert.equal(sanitizeFilename({}), null);
});

test('sanitizeFilename: rejects whitespace + special chars', () => {
  assert.equal(sanitizeFilename('with space.xlsx'), null);
  assert.equal(sanitizeFilename('semi;colon.xlsx'), null);
  assert.equal(sanitizeFilename('quote".xlsx'), null);
});

// --- tokensMatch ---

test('tokensMatch: equal tokens return true', () => {
  const t = crypto.randomBytes(24).toString('hex');
  assert.equal(tokensMatch(t, t), true);
});

test('tokensMatch: different tokens of same length return false', () => {
  const a = 'a'.repeat(48);
  const b = 'b'.repeat(48);
  assert.equal(tokensMatch(a, b), false);
});

test('tokensMatch: different lengths return false (no timing leak)', () => {
  assert.equal(tokensMatch('abc', 'abcdef'), false);
  assert.equal(tokensMatch('', 'anything'), false);
});

test('tokensMatch: non-string input returns false', () => {
  assert.equal(tokensMatch(null, 'abc'), false);
  assert.equal(tokensMatch('abc', undefined), false);
  assert.equal(tokensMatch(42, 'abc'), false);
});
