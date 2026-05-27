// Unit tests for the scoring engine, against the rules doc's worked examples + edge cases.
// Run: npm test

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { score } = require('./score');

// --- Builders to keep tests readable ---

function makePrediction(overrides = {}) {
  return {
    token: 't1',
    handle: 'player_1',
    name: 'Player One',
    submittedAt: '2026-06-08T00:00:00Z',
    sourceFile: 'p1.xlsx',
    groupScores: {},
    round32: [],
    round16: [],
    quarterFinal: [],
    semiFinal: [],
    final: [],
    winner: null,
    tiebreaker: null,
    warnings: [],
    ...overrides,
  };
}

function groupResult(matchId, home, away, homeScore, awayScore) {
  return {
    matchId,
    stage: 'group',
    home,
    away,
    homeScore,
    awayScore,
    winner: homeScore > awayScore ? home : homeScore < awayScore ? away : null,
    actualDate: '2026-06-11',
  };
}

function knockoutResult(matchId, stage, home, away, winner) {
  return { matchId, stage, home, away, winner, actualDate: '2026-06-20' };
}

// --- Tests ---

test('rules doc example 1: 2-1 actual, 3-1 prediction → 3 pts (correct outcome, wrong score)', () => {
  const pred = makePrediction({
    groupScores: { 'G-C-1': { home: 3, away: 1 } },
  });
  const results = [groupResult('G-C-1', 'BRA', 'MAR', 2, 1)];
  const lb = score([pred], results, {});
  assert.equal(lb[0].pointsByStage.group, 3);
  assert.equal(lb[0].totalPoints, 3);
  assert.equal(lb[0].correctCounts.groupResult, 1);
  assert.equal(lb[0].correctCounts.groupExact, 0);
});

test('rules doc example 2: 2-1 actual, 2-1 prediction → 5 pts (exact)', () => {
  const pred = makePrediction({
    groupScores: { 'G-C-1': { home: 2, away: 1 } },
  });
  const results = [groupResult('G-C-1', 'BRA', 'MAR', 2, 1)];
  const lb = score([pred], results, {});
  assert.equal(lb[0].pointsByStage.group, 5);
  assert.equal(lb[0].correctCounts.groupExact, 1);
  assert.equal(lb[0].correctCounts.groupResult, 0);
});

test('rules doc example 3: 2-1 actual, 1-1 prediction → 0 pts (wrong outcome)', () => {
  const pred = makePrediction({
    groupScores: { 'G-C-1': { home: 1, away: 1 } },
  });
  const results = [groupResult('G-C-1', 'BRA', 'MAR', 2, 1)];
  const lb = score([pred], results, {});
  assert.equal(lb[0].totalPoints, 0);
});

test('draw both sides: 0-0 actual, 0-0 prediction → 5 pts', () => {
  const pred = makePrediction({
    groupScores: { 'G-A-1': { home: 0, away: 0 } },
  });
  const results = [groupResult('G-A-1', 'MEX', 'ZAF', 0, 0)];
  const lb = score([pred], results, {});
  assert.equal(lb[0].pointsByStage.group, 5);
});

test('draw correct, score wrong: 1-1 actual, 2-2 prediction → 3 pts', () => {
  const pred = makePrediction({
    groupScores: { 'G-A-1': { home: 2, away: 2 } },
  });
  const results = [groupResult('G-A-1', 'MEX', 'ZAF', 1, 1)];
  const lb = score([pred], results, {});
  assert.equal(lb[0].pointsByStage.group, 3);
});

test('missing prediction: match in results but groupScores[matchId] undefined → 0 pts, no crash', () => {
  const pred = makePrediction({ groupScores: {} });
  const results = [groupResult('G-A-1', 'MEX', 'ZAF', 2, 1)];
  const lb = score([pred], results, {});
  assert.equal(lb[0].totalPoints, 0);
});

test('knockout independence: BRA predicted in R32/R16/QF, BRA reached QF (lost) → 5+10+15 = 30', () => {
  const pred = makePrediction({
    round32: ['BRA'],
    round16: ['BRA'],
    quarterFinal: ['BRA'],
  });
  const results = [
    knockoutResult('R32-01', 'r32', 'BRA', 'NOR', 'BRA'),
    knockoutResult('R16-01', 'r16', 'BRA', 'FRA', 'BRA'),
    knockoutResult('QF-1',   'qf',  'BRA', 'ARG', 'ARG'),
  ];
  const lb = score([pred], results, {});
  assert.equal(lb[0].pointsByStage.r32, 5);
  assert.equal(lb[0].pointsByStage.r16, 10);
  assert.equal(lb[0].pointsByStage.qf, 15);
  assert.equal(lb[0].totalPoints, 30);
});

test('knockout subset: BRA in QF but only reached R16 → 0 QF pts (still 10 R16 pts)', () => {
  const pred = makePrediction({
    round16: ['BRA'],
    quarterFinal: ['BRA'],
  });
  const results = [
    knockoutResult('R16-01', 'r16', 'BRA', 'FRA', 'BRA'),
    // BRA never played a QF — they were eliminated before that round
  ];
  const lb = score([pred], results, {});
  assert.equal(lb[0].pointsByStage.r16, 10);
  assert.equal(lb[0].pointsByStage.qf, 0);
});

test('tiebreaker: two players on 100 pts, both 10 from actual → tied on tiebreakDelta', () => {
  const baseResults = Array.from({ length: 20 }, (_, i) => groupResult(`G-A-${i+1}`, 'MEX', 'ZAF', 1, 0));
  const groupScoresFor20 = {};
  for (let i = 0; i < 20; i++) groupScoresFor20[`G-A-${i+1}`] = { home: 1, away: 0 };

  const p1 = makePrediction({ token: 'a', handle: 'a', groupScores: groupScoresFor20, tiebreaker: 160 });
  const p2 = makePrediction({ token: 'b', handle: 'b', groupScores: groupScoresFor20, tiebreaker: 180 });
  const lb = score([p1, p2], baseResults, {}, { actualTotalGoals: 170 });
  assert.equal(lb[0].totalPoints, 100);
  assert.equal(lb[1].totalPoints, 100);
  assert.equal(lb[0].tiebreakDelta, 10);
  assert.equal(lb[1].tiebreakDelta, 10);
});

test('winner correct: prediction.winner=ARG, final.winner=ARG → +30', () => {
  const pred = makePrediction({ winner: 'ARG' });
  const results = [knockoutResult('F-1', 'final', 'ARG', 'BRA', 'ARG')];
  const lb = score([pred], results, {});
  assert.equal(lb[0].pointsByStage.winner, 30);
  assert.equal(lb[0].totalPoints, 30);
});

test('maximum score: perfect prediction vs perfect results → 960 pts', () => {
  // 72 group exact scores = 72*5 = 360
  // R32: 32 teams × 5 = 160
  // R16: 16 teams × 10 = 160
  // QF: 8 teams × 15 = 120
  // SF: 4 teams × 20 = 80
  // Final: 2 teams × 25 = 50
  // Winner: 30
  // Total = 360 + 160 + 160 + 120 + 80 + 50 + 30 = 960

  // Build 72 group matches with deterministic team codes.
  const teamPool = Array.from({ length: 48 }, (_, i) => `T${String(i+1).padStart(2,'0')}`);
  const groupScores = {};
  const groupResults = [];
  for (let i = 0; i < 72; i++) {
    const id = `G-X-${i+1}`;
    const homeScore = (i % 4);
    const awayScore = (i % 3);
    groupScores[id] = { home: homeScore, away: awayScore };
    groupResults.push({
      matchId: id, stage: 'group', home: teamPool[i % 48], away: teamPool[(i+1) % 48],
      homeScore, awayScore,
      winner: homeScore > awayScore ? teamPool[i % 48] : homeScore < awayScore ? teamPool[(i+1) % 48] : null,
      actualDate: '2026-06-11',
    });
  }

  const r32Teams = teamPool.slice(0, 32);
  const r16Teams = teamPool.slice(0, 16);
  const qfTeams = teamPool.slice(0, 8);
  const sfTeams = teamPool.slice(0, 4);
  const finalTeams = teamPool.slice(0, 2);

  const koResults = [];
  // pair them up for matches
  for (let i = 0; i < 16; i++) koResults.push(knockoutResult(`R32-${i+1}`, 'r32', r32Teams[2*i], r32Teams[2*i+1], r32Teams[2*i]));
  for (let i = 0; i < 8;  i++) koResults.push(knockoutResult(`R16-${i+1}`, 'r16', r16Teams[2*i], r16Teams[2*i+1], r16Teams[2*i]));
  for (let i = 0; i < 4;  i++) koResults.push(knockoutResult(`QF-${i+1}`,  'qf',  qfTeams[2*i], qfTeams[2*i+1],  qfTeams[2*i]));
  for (let i = 0; i < 2;  i++) koResults.push(knockoutResult(`SF-${i+1}`,  'sf',  sfTeams[2*i], sfTeams[2*i+1],  sfTeams[2*i]));
  koResults.push(knockoutResult('F-1', 'final', finalTeams[0], finalTeams[1], finalTeams[0]));

  const pred = makePrediction({
    groupScores,
    round32: r32Teams,
    round16: r16Teams,
    quarterFinal: qfTeams,
    semiFinal: sfTeams,
    final: finalTeams,
    winner: finalTeams[0],
  });

  const lb = score([pred], [...groupResults, ...koResults], {});
  assert.equal(lb[0].totalPoints, 960);
});

test('empty results: no completed matches → everyone has 0 pts', () => {
  const p1 = makePrediction({ token: 'a', handle: 'a' });
  const p2 = makePrediction({ token: 'b', handle: 'b' });
  const lb = score([p1, p2], [], {});
  assert.equal(lb[0].totalPoints, 0);
  assert.equal(lb[1].totalPoints, 0);
});

test('bounds: random predictions vs random results stay in [0, 960]', () => {
  const teams = Array.from({ length: 48 }, (_, i) => `T${i}`);
  const rng = (() => { let s = 42; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  const pickN = (n) => { const out = []; for (let i = 0; i < n; i++) out.push(teams[Math.floor(rng() * teams.length)]); return out; };

  for (let trial = 0; trial < 20; trial++) {
    const groupScores = {};
    const results = [];
    for (let i = 0; i < 30; i++) {
      const id = `G-X-${i+1}`;
      groupScores[id] = { home: Math.floor(rng() * 5), away: Math.floor(rng() * 5) };
      results.push({
        matchId: id, stage: 'group', home: 'H', away: 'A',
        homeScore: Math.floor(rng() * 5), awayScore: Math.floor(rng() * 5),
        winner: null, actualDate: '2026-06-11',
      });
    }
    const pred = makePrediction({
      groupScores,
      round32: pickN(32),
      round16: pickN(16),
      quarterFinal: pickN(8),
      semiFinal: pickN(4),
      final: pickN(2),
      winner: teams[0],
    });
    const lb = score([pred], results, {});
    assert.ok(lb[0].totalPoints >= 0 && lb[0].totalPoints <= 960,
      `Trial ${trial}: total ${lb[0].totalPoints} out of bounds`);
  }
});

test('sort: leaderboard sorted by totalPoints desc, then tiebreakDelta asc', () => {
  const groupScores = { 'G-A-1': { home: 2, away: 1 } };
  const results = [groupResult('G-A-1', 'MEX', 'ZAF', 2, 1)]; // 5 pts to whoever picks 2-1

  const p1 = makePrediction({ token: 'a', handle: 'a', groupScores, tiebreaker: 100 });   // 5 pts, delta 20
  const p2 = makePrediction({ token: 'b', handle: 'b', groupScores, tiebreaker: 130 });   // 5 pts, delta 10
  const p3 = makePrediction({ token: 'c', handle: 'c', groupScores: {}, tiebreaker: 120 }); // 0 pts
  const lb = score([p1, p2, p3], results, {}, { actualTotalGoals: 120 });

  assert.equal(lb[0].handle, 'b'); // 5 pts, delta 10
  assert.equal(lb[1].handle, 'a'); // 5 pts, delta 20
  assert.equal(lb[2].handle, 'c'); // 0 pts
});
