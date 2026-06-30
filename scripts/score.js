// Pure scoring engine for the WC2026 Predictor.
//
//   score(predictions, results, fixtures, opts?) → Leaderboard[]
//
// No I/O, no module-level state. Safe to call repeatedly with the same arguments.
//
// Scoring rules (encoded verbatim from asset/WC2026_Predictor_Game_Rules):
//   - Group match exact score        → 5 pts (replaces, not adds to, the 3-pt outcome reward)
//   - Group match correct outcome    → 3 pts
//   - R32 team correctly placed      → 5 pts each
//   - R16 team correctly placed      → 10 pts each
//   - QF team correctly placed       → 15 pts each
//   - SF team correctly placed       → 20 pts each
//   - Final team correctly placed    → 25 pts each
//   - Winner correctly picked        → 30 pts
//   Tie-breaker: |predicted total goals − actual total goals|, ascending.
//
// Knockout points are per-team-in-round and independent of opponent — a team predicted to reach
// the QF scores 15 even if it gets there via a different bracket path.

const KO_STAGES = [
  { key: 'round32',      stage: 'r32',   points: 5,  scheduleStage: 'LAST_32'        },
  { key: 'round16',      stage: 'r16',   points: 10, scheduleStage: 'LAST_16'        },
  { key: 'quarterFinal', stage: 'qf',    points: 15, scheduleStage: 'QUARTER_FINALS' },
  { key: 'semiFinal',    stage: 'sf',    points: 20, scheduleStage: 'SEMI_FINALS'    },
  { key: 'final',        stage: 'final', points: 25, scheduleStage: 'FINAL'          },
];
const WINNER_POINTS = 30;

const { titleCaseName } = require('./format-name');

function outcome(home, away) {
  return home > away ? 'H' : home < away ? 'A' : 'D';
}

// Teams that reached a given knockout stage = teams in any finished result for that stage,
// unioned with teams drawn into scheduled (but not yet played) fixtures for that stage.
// scheduleMatches is the matches array from schedule.json (optional).
function teamsReachingStage(results, stage, scheduleMatches) {
  const set = new Set();
  for (const r of results) {
    if (r.stage === stage) {
      if (r.home) set.add(r.home);
      if (r.away) set.add(r.away);
    }
  }
  if (scheduleMatches) {
    const ko = KO_STAGES.find(s => s.stage === stage);
    if (ko) {
      for (const m of scheduleMatches) {
        if (m.stage === ko.scheduleStage) {
          if (m.home?.code) set.add(m.home.code);
          if (m.away?.code) set.add(m.away.code);
        }
      }
    }
  }
  return set;
}

function actualWinner(results) {
  const final = results.find(r => r.stage === 'final');
  return final ? (final.winner || null) : null;
}

function scoreOne(prediction, results, scheduleMatches) {
  const pointsByStage = { group: 0, r32: 0, r16: 0, qf: 0, sf: 0, final: 0, winner: 0 };
  const correctCounts = { groupResult: 0, groupExact: 0, r32: 0, r16: 0, qf: 0, sf: 0, final: 0 };

  const groupScores = prediction.groupScores || {};

  for (const r of results) {
    if (r.stage !== 'group') continue;
    const pick = groupScores[r.matchId];
    if (pick == null) continue;
    if (typeof pick.home !== 'number' || typeof pick.away !== 'number') continue;

    if (pick.home === r.homeScore && pick.away === r.awayScore) {
      pointsByStage.group += 5;
      correctCounts.groupExact += 1;
    } else if (outcome(pick.home, pick.away) === outcome(r.homeScore, r.awayScore)) {
      pointsByStage.group += 3;
      correctCounts.groupResult += 1;
    }
  }

  for (const { key, stage, points } of KO_STAGES) {
    const predicted = new Set(prediction[key] || []);
    const actual = teamsReachingStage(results, stage, scheduleMatches);
    let hits = 0;
    for (const team of predicted) {
      if (actual.has(team)) hits += 1;
    }
    pointsByStage[stage] = hits * points;
    correctCounts[stage] = hits;
  }

  const actWinner = actualWinner(results);
  if (actWinner && prediction.winner === actWinner) {
    pointsByStage.winner = WINNER_POINTS;
  }

  const totalPoints = Object.values(pointsByStage).reduce((s, v) => s + v, 0);

  return {
    token: prediction.token,
    handle: prediction.handle,
    name: prediction.name,
    displayName: titleCaseName(prediction.name),
    pointsByStage,
    totalPoints,
    correctCounts,
    tiebreaker: prediction.tiebreaker ?? null,
    tiebreakDelta: null,
  };
}

function score(predictions, results, fixtures, opts = {}) {
  const scheduleMatches = opts.scheduleMatches || (fixtures && fixtures.scheduleMatches) || null;
  const entries = predictions.map(p => scoreOne(p, results, scheduleMatches));

  if (typeof opts.actualTotalGoals === 'number') {
    for (const e of entries) {
      if (typeof e.tiebreaker === 'number') {
        e.tiebreakDelta = Math.abs(e.tiebreaker - opts.actualTotalGoals);
      }
    }
  }

  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (a.tiebreakDelta != null && b.tiebreakDelta != null) {
      return a.tiebreakDelta - b.tiebreakDelta;
    }
    return 0;
  });

  return entries;
}

module.exports = { score, outcome, teamsReachingStage, actualWinner, KO_STAGES, WINNER_POINTS };
