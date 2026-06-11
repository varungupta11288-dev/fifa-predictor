// Unit tests for the team-name resolver, focused on the "&"/"and" normalization
// that prevented "Bosnia & Herzegovina" from resolving.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveTeam, normalize } = require('./normalize-team');

test('normalize: "&" collapses to "and"', () => {
  assert.equal(normalize('Bosnia & Herzegovina'), 'bosnia and herzegovina');
  assert.equal(normalize('A&B'), 'a and b');
  assert.equal(normalize('Bosnia and Herzegovina'), 'bosnia and herzegovina');
});

test('Bosnia: every spelling resolves to BIH', () => {
  for (const input of [
    'Bosnia & Herzegovina',
    'Bosnia and Herzegovina',
    'Bosnia & Herz.',
    'Bosnia and Herz.',
    'Bosnia',
  ]) {
    const r = resolveTeam(input);
    assert.ok(r, `expected resolution for "${input}"`);
    assert.equal(r.code, 'BIH', `"${input}" → ${r && r.code}`);
  }
});

test('canonical "Bosnia & Herz." resolves via the "and"-form key', () => {
  const r = resolveTeam('Bosnia & Herz.');
  assert.equal(r.code, 'BIH');
});

test('non-& teams still resolve (no regression)', () => {
  assert.equal(resolveTeam('Brazil').code, 'BRA');
  assert.equal(resolveTeam('USA').code, 'USA');
  assert.equal(resolveTeam('Côte d\'Ivoire').code, 'CIV');
});

test('genuine garbage still returns null', () => {
  assert.equal(resolveTeam('Atlantis'), null);
  assert.equal(resolveTeam(''), null);
});
