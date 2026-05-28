// Pre-joined per-player views: for each prediction, attach the scored row-by-row breakdown that
// /me/<token>/ needs to render. Keeps the Nunjucks template trivial.
const fs = require('fs');
const path = require('path');
const { outcome, teamsReachingStage, actualWinner, KO_STAGES, WINNER_POINTS } = require('../../scripts/score');

const ROOT = path.join(__dirname, '..', '..');

// email + sourceFile must never reach the rendered HTML.
function stripSensitive({ email, sourceFile, ...rest }) {
  return rest;
}

function loadJsonDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => stripSensitive(JSON.parse(fs.readFileSync(path.join(dir, f)))));
}

module.exports = () => {
  const predictions = loadJsonDir(path.join(ROOT, 'data', 'predictions'));
  const resultFiles = fs.existsSync(path.join(ROOT, 'data', 'results'))
    ? fs.readdirSync(path.join(ROOT, 'data', 'results')).filter(f => f.endsWith('.json')).sort()
    : [];
  const results = resultFiles.flatMap(f =>
    JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'results', f)))
  );
  const matches = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fixtures', 'matches.json')));

  // Index results by matchId for quick lookup
  const resultById = new Map(results.map(r => [r.matchId, r]));
  // Pre-compute teams reaching each KO stage
  const reachedByStage = {};
  for (const { stage } of KO_STAGES) {
    reachedByStage[stage] = teamsReachingStage(results, stage);
  }
  const champion = actualWinner(results);

  return predictions.map(p => {
    const groupRows = matches.filter(m => m.stage === 'group').map(m => {
      const pick = p.groupScores[m.id] || null;
      const actual = resultById.get(m.id) || null;
      let points = null;
      let outcomeClass = '';
      if (actual && pick && typeof pick.home === 'number' && typeof pick.away === 'number') {
        if (pick.home === actual.homeScore && pick.away === actual.awayScore) {
          points = 5; outcomeClass = 'exact';
        } else if (outcome(pick.home, pick.away) === outcome(actual.homeScore, actual.awayScore)) {
          points = 3; outcomeClass = 'result';
        } else {
          points = 0; outcomeClass = 'wrong';
        }
      } else if (actual && !pick) {
        points = 0; outcomeClass = 'missing';
      }
      return {
        matchId: m.id,
        home: m.home,
        away: m.away,
        group: m.group,
        predicted: pick,
        actual,
        points,
        outcomeClass,
      };
    });

    const knockoutSections = KO_STAGES.map(({ key, stage, points }) => {
      const reached = reachedByStage[stage];
      const picks = (p[key] || []).map(team => ({
        team,
        hit: reached.has(team),
        pointsIfHit: points,
      }));
      return { stage, key, label: stage.toUpperCase(), pointsPer: points, picks };
    });

    const winnerHit = champion != null && p.winner === champion;

    return {
      ...p,
      groupRows,
      knockoutSections,
      winnerHit,
      winnerPoints: winnerHit ? WINNER_POINTS : 0,
    };
  });
};
