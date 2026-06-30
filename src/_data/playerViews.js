// Pre-joined per-player views: for each prediction, attach the scored row-by-row breakdown that
// /me/<token>/ needs to render. Keeps the Nunjucks template trivial.
const fs = require('fs');
const path = require('path');
const { outcome, teamsReachingStage, actualWinner, KO_STAGES, WINNER_POINTS } = require('../../scripts/score');
const { resolveTeam } = require('../../scripts/normalize-team');
const { titleCaseName } = require('../../scripts/format-name');

const ROOT = path.join(__dirname, '..', '..');

// Schedule short-names the fuzzy resolver doesn't carry an alias for. We only
// need them to recover the team CODE so we can read iso2 off the same record.
const SCHEDULE_NAME_TO_CODE = { 'Bosnia-H.': 'BIH', 'Congo DR': 'COD' };

// Build code → { name, iso2 } from the canonical team list (names) joined to the
// football-data schedule snapshot (iso2 flags), so the per-player group tables
// can render flags + full country names exactly like the Fixtures page.
function buildTeamLookup() {
  const teams = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fixtures', 'teams.json')));
  const schedulePath = path.join(ROOT, 'data', 'fixtures', 'schedule.json');
  const codeToIso = {};
  if (fs.existsSync(schedulePath)) {
    const { matches } = JSON.parse(fs.readFileSync(schedulePath));
    for (const m of matches) {
      for (const t of [m.home, m.away]) {
        if (!t || !t.iso2) continue;
        const code = (resolveTeam(t.name) || {}).code || SCHEDULE_NAME_TO_CODE[t.name];
        if (code) codeToIso[code] = t.iso2;
      }
    }
  }
  const byCode = {};
  for (const t of teams) byCode[t.code] = { name: t.name, iso2: codeToIso[t.code] || null };
  return byCode;
}

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
  const schedulePath = path.join(ROOT, 'data', 'fixtures', 'schedule.json');
  const scheduleMatches = fs.existsSync(schedulePath)
    ? JSON.parse(fs.readFileSync(schedulePath)).matches
    : null;

  // Index results by matchId for quick lookup
  const resultById = new Map(results.map(r => [r.matchId, r]));
  // Pre-compute teams reaching each KO stage (includes drawn-but-unplayed fixtures)
  const reachedByStage = {};
  for (const { stage } of KO_STAGES) {
    reachedByStage[stage] = teamsReachingStage(results, stage, scheduleMatches);
  }
  const champion = actualWinner(results);
  const teamByCode = buildTeamLookup();
  const team = code => teamByCode[code] || { name: code, iso2: null };

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
        home: team(m.home),
        away: team(m.away),
        group: m.group,
        predicted: pick,
        actual,
        points,
        outcomeClass,
      };
    });

    // Split into one section per group (A..L), preserving fixture order — mirrors
    // the Fixtures page's per-group cards.
    const groupSections = [];
    const byLetter = {};
    for (const row of groupRows) {
      if (!byLetter[row.group]) {
        byLetter[row.group] = { letter: row.group, title: `Group ${row.group}`, rows: [] };
        groupSections.push(byLetter[row.group]);
      }
      byLetter[row.group].rows.push(row);
    }

    const knockoutSections = KO_STAGES.map(({ key, stage, points }) => {
      const reached = reachedByStage[stage];
      const picks = (p[key] || []).map(code => ({
        team: team(code),          // { name, iso2 } for flag + country name
        hit: reached.has(code),
        pointsIfHit: points,
      }));
      return { stage, key, label: stage.toUpperCase(), pointsPer: points, picks };
    });

    const winnerHit = champion != null && p.winner === champion;
    const winnerTeam = p.winner ? team(p.winner) : null;

    return {
      ...p,
      displayName: titleCaseName(p.name),
      groupSections,
      knockoutSections,
      winnerTeam,
      winnerHit,
      winnerPoints: winnerHit ? WINNER_POINTS : 0,
    };
  });
};
