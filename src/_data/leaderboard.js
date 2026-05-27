const fs = require('fs');
const path = require('path');
const { score } = require('../../scripts/score');

module.exports = () => {
  const predDir = path.join(__dirname, '..', '..', 'data', 'predictions');
  const resultsDir = path.join(__dirname, '..', '..', 'data', 'results');
  const fixturesDir = path.join(__dirname, '..', '..', 'data', 'fixtures');

  const predictions = fs.existsSync(predDir)
    ? fs.readdirSync(predDir).filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(fs.readFileSync(path.join(predDir, f))))
    : [];

  const results = fs.existsSync(resultsDir)
    ? fs.readdirSync(resultsDir).filter(f => f.endsWith('.json')).sort()
        .flatMap(f => JSON.parse(fs.readFileSync(path.join(resultsDir, f))))
    : [];

  const fixtures = {
    teams: JSON.parse(fs.readFileSync(path.join(fixturesDir, 'teams.json'))),
    groups: JSON.parse(fs.readFileSync(path.join(fixturesDir, 'groups.json'))),
    matches: JSON.parse(fs.readFileSync(path.join(fixturesDir, 'matches.json'))),
  };

  const ranked = score(predictions, results, fixtures);
  // Assign 1-based ranks with ties → equal rank (competition ranking, 1224)
  let lastPoints = null, lastRank = 0;
  ranked.forEach((row, i) => {
    if (row.totalPoints !== lastPoints) {
      lastRank = i + 1;
      lastPoints = row.totalPoints;
    }
    row.rank = lastRank;
  });
  return ranked;
};
