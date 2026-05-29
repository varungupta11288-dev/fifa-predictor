// Unit tests for the API → results derivation in fetch-schedule.js.
// Pure transform — no network.

const test = require('node:test');
const assert = require('node:assert');
const { deriveResults } = require('./fetch-schedule');

// Minimal slice of our fixtures (data/fixtures/matches.json schema).
const FIXTURES = [
  { id: 'G-A-1', stage: 'group', group: 'A', home: 'MEX', away: 'ZAF' },
  { id: 'G-A-4', stage: 'group', group: 'A', home: 'CZE', away: 'ZAF' },
];

// Helper to build a trimmed-schedule entry (as fetch-schedule produces).
function apiMatch(over) {
  return {
    id: 1, stage: 'GROUP_STAGE', group: 'GROUP_A',
    utcDate: '2026-06-11T19:00:00Z', status: 'FINISHED',
    home: { tla: 'MEX' }, away: { tla: 'RSA' },
    score: { home: 2, away: 1, winner: 'HOME_TEAM' },
    ...over,
  };
}

test('group result: maps TLAs to our codes and keeps orientation', () => {
  const [r] = deriveResults([apiMatch()], FIXTURES);
  assert.deepEqual(r, {
    matchId: 'G-A-1', stage: 'group', home: 'MEX', away: 'ZAF',
    homeScore: 2, awayScore: 1, winner: 'MEX', actualDate: '2026-06-11',
  });
});

test('group result: orients score to OUR home/away when API order is swapped', () => {
  // Our G-A-4 is CZE(home) v ZAF(away). API reports RSA(home) 0 v CZE(away) 3.
  const m = apiMatch({
    id: 4, home: { tla: 'RSA' }, away: { tla: 'CZE' },
    score: { home: 0, away: 3, winner: 'AWAY_TEAM' },
  });
  const [r] = deriveResults([m], FIXTURES);
  assert.equal(r.matchId, 'G-A-4');
  assert.equal(r.home, 'CZE');
  assert.equal(r.away, 'ZAF');
  assert.equal(r.homeScore, 3);   // CZE's 3 lands on our home
  assert.equal(r.awayScore, 0);
  assert.equal(r.winner, 'CZE');  // winner is the team code regardless of orientation
});

test('group draw → winner null', () => {
  const m = apiMatch({ score: { home: 1, away: 1, winner: 'DRAW' } });
  const [r] = deriveResults([m], FIXTURES);
  assert.equal(r.winner, null);
});

test('unfinished matches are skipped', () => {
  const m = apiMatch({ status: 'TIMED', score: { home: null, away: null, winner: null } });
  assert.equal(deriveResults([m], FIXTURES).length, 0);
});

test('knockout: real matchup + winner, synthetic matchId, mapped stage', () => {
  const m = {
    id: 537417, stage: 'LAST_32', group: null,
    utcDate: '2026-06-28T19:00:00Z', status: 'FINISHED',
    home: { tla: 'GER' }, away: { tla: 'NED' },
    score: { home: 1, away: 0, winner: 'HOME_TEAM' },
  };
  const [r] = deriveResults([m], FIXTURES);
  assert.equal(r.matchId, 'KO-537417');
  assert.equal(r.stage, 'r32');
  assert.equal(r.home, 'DEU');   // GER → DEU
  assert.equal(r.away, 'NLD');   // NED → NLD
  assert.equal(r.winner, 'DEU');
  assert.equal(r.actualDate, '2026-06-28');
});

test('3rd-place play-off is excluded (awards no points)', () => {
  const m = {
    id: 9, stage: 'THIRD_PLACE', group: null,
    utcDate: '2026-07-18T19:00:00Z', status: 'FINISHED',
    home: { tla: 'FRA' }, away: { tla: 'ENG' },
    score: { home: 2, away: 1, winner: 'HOME_TEAM' },
  };
  assert.equal(deriveResults([m], FIXTURES).length, 0);
});

test('knockout with undrawn (null) teams is skipped', () => {
  const m = {
    id: 7, stage: 'FINAL', group: null,
    utcDate: '2026-07-19T19:00:00Z', status: 'TIMED',
    home: null, away: null,
    score: { home: null, away: null, winner: null },
  };
  assert.equal(deriveResults([m], FIXTURES).length, 0);
});
