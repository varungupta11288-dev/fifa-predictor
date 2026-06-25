// Fetch the full WC2026 match schedule from football-data.org (v4) and write a
// trimmed, committed snapshot to data/fixtures/schedule.json.
//
// The static build reads the committed snapshot (no network / API key needed at
// build time, so CI stays reproducible). Re-run this manually to refresh kickoff
// times, the knockout bracket as teams are drawn, and final scores:
//
//   node --env-file=.env scripts/fetch-schedule.js
//
// Requires FOOTBALL_API in .env (your football-data.org token).

const fs = require('fs');
const path = require('path');

const API = 'https://api.football-data.org/v4/competitions/WC/matches';

// football-data.org uses FIFA-style 3-letter team codes. Map each to its
// ISO 3166-1 alpha-2 (flagcdn) code. England/Scotland use flagcdn's GB subdivisions.
const TLA_TO_ISO2 = {
  ALG: 'dz', ARG: 'ar', AUS: 'au', AUT: 'at', BEL: 'be', BIH: 'ba', BRA: 'br',
  CAN: 'ca', CIV: 'ci', COD: 'cd', COL: 'co', CPV: 'cv', CRO: 'hr', CUW: 'cw',
  CZE: 'cz', ECU: 'ec', EGY: 'eg', ENG: 'gb-eng', ESP: 'es', FRA: 'fr',
  GER: 'de', GHA: 'gh', HAI: 'ht', IRN: 'ir', IRQ: 'iq', JOR: 'jo', JPN: 'jp',
  KOR: 'kr', KSA: 'sa', MAR: 'ma', MEX: 'mx', NED: 'nl', NOR: 'no', NZL: 'nz',
  PAN: 'pa', PAR: 'py', POR: 'pt', QAT: 'qa', RSA: 'za', SCO: 'gb-sct',
  SEN: 'sn', SUI: 'ch', SWE: 'se', TUN: 'tn', TUR: 'tr', URU: 'uy', URY: 'uy', USA: 'us',
  UZB: 'uz',
};

// football-data.org's FIFA-style TLA → our internal ISO-3 team code (teams.json).
// Most match; only the FIFA/ISO mismatches are remapped.
const TLA_TO_CODE = {
  ALG: 'DZA', ARG: 'ARG', AUS: 'AUS', AUT: 'AUT', BEL: 'BEL', BIH: 'BIH',
  BRA: 'BRA', CAN: 'CAN', CIV: 'CIV', COD: 'COD', COL: 'COL', CPV: 'CPV',
  CRO: 'HRV', CUW: 'CUW', CZE: 'CZE', ECU: 'ECU', EGY: 'EGY', ENG: 'ENG',
  ESP: 'ESP', FRA: 'FRA', GER: 'DEU', GHA: 'GHA', HAI: 'HTI', IRN: 'IRN',
  IRQ: 'IRQ', JOR: 'JOR', JPN: 'JPN', KOR: 'KOR', KSA: 'SAU', MAR: 'MAR',
  MEX: 'MEX', NED: 'NLD', NOR: 'NOR', NZL: 'NZL', PAN: 'PAN', PAR: 'PRY',
  POR: 'PRT', QAT: 'QAT', RSA: 'ZAF', SCO: 'SCO', SEN: 'SEN', SUI: 'CHE',
  SWE: 'SWE', TUN: 'TUN', TUR: 'TUR', URU: 'URY', URY: 'URY', USA: 'USA', UZB: 'UZB',
};

// API stage → our results-schema stage key. 3rd-place is omitted on purpose:
// it awards no points (see score.js KO_STAGES), so it never enters scoring.
const STAGE_MAP = {
  GROUP_STAGE: 'group', LAST_32: 'r32', LAST_16: 'r16',
  QUARTER_FINALS: 'qf', SEMI_FINALS: 'sf', FINAL: 'final',
};

function team(t) {
  if (!t || !t.tla) return null;
  const iso2 = TLA_TO_ISO2[t.tla];
  if (!iso2) console.warn(`[fetch-schedule] no flag mapping for TLA "${t.tla}" (${t.name})`);
  return { tla: t.tla, name: t.shortName || t.name, iso2: iso2 || null };
}

function isFinished(m) {
  return m.status === 'FINISHED' || (m.score && m.score.home != null && m.score.away != null);
}

// Maps the API's HOME_TEAM / AWAY_TEAM / DRAW to the actual winning team code.
function winnerCode(score, homeCode, awayCode) {
  if (!score) return null;
  if (score.winner === 'HOME_TEAM') return homeCode;
  if (score.winner === 'AWAY_TEAM') return awayCode;
  return null; // DRAW or undecided
}

// Pure transform: trimmed API schedule (+ our fixtures list) → result objects in
// the data/results schema that score.js consumes. Finished matches only.
//   - Group matches are matched to our fixture by group + team pair, then scores
//     are oriented to OUR home/away (predictions are keyed that way).
//   - Knockout matches carry the real matchup + winner; scoring only cares that
//     a team appears in a stage (teamsReachingStage) plus the final's winner.
function deriveResults(schedule, fixtures) {
  // Lookup: "<groupLetter>:<sorted team pair>" → our group fixture.
  const groupByPair = new Map();
  for (const m of fixtures) {
    if (m.stage !== 'group') continue;
    groupByPair.set(`${m.group}:${[m.home, m.away].sort().join('|')}`, m);
  }

  const out = [];
  for (const m of schedule) {
    const ourStage = STAGE_MAP[m.stage];
    if (!ourStage) continue;                  // skips THIRD_PLACE
    if (!isFinished(m)) continue;
    if (!m.home || !m.away) continue;          // teams not drawn yet

    const homeCode = TLA_TO_CODE[m.home.tla];
    const awayCode = TLA_TO_CODE[m.away.tla];
    if (!homeCode || !awayCode) {
      console.warn(`[fetch-schedule] no team-code mapping for ${m.home.tla}/${m.away.tla}`);
      continue;
    }
    const actualDate = m.utcDate.slice(0, 10);

    if (ourStage === 'group') {
      const key = `${(m.group || '').replace('GROUP_', '')}:${[homeCode, awayCode].sort().join('|')}`;
      const fx = groupByPair.get(key);
      if (!fx) {
        console.warn(`[fetch-schedule] no group fixture for ${homeCode} v ${awayCode} (${m.group})`);
        continue;
      }
      // Orient the API score to our fixture's home/away.
      const swap = fx.home !== homeCode;
      out.push({
        matchId: fx.id,
        stage: 'group',
        home: fx.home,
        away: fx.away,
        homeScore: swap ? m.score.away : m.score.home,
        awayScore: swap ? m.score.home : m.score.away,
        winner: winnerCode(m.score, homeCode, awayCode),
        actualDate,
      });
    } else {
      out.push({
        matchId: `KO-${m.id}`,
        stage: ourStage,
        home: homeCode,
        away: awayCode,
        homeScore: m.score.home,
        awayScore: m.score.away,
        winner: winnerCode(m.score, homeCode, awayCode),
        actualDate,
      });
    }
  }
  return out;
}

async function main() {
  const key = process.env.FOOTBALL_API;
  if (!key) {
    console.error('FOOTBALL_API not set. Run with: node --env-file=.env scripts/fetch-schedule.js');
    process.exit(1);
  }

  const res = await fetch(API, { headers: { 'X-Auth-Token': key } });
  if (!res.ok) {
    console.error(`API error ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const { matches } = await res.json();
  if (!Array.isArray(matches) || matches.length === 0) {
    console.error('No matches returned from API.');
    process.exit(1);
  }

  const schedule = matches
    .map(m => ({
      id: m.id,
      stage: m.stage,
      group: m.group || null,
      utcDate: m.utcDate,
      status: m.status,
      home: team(m.homeTeam),
      away: team(m.awayTeam),
      score: {
        home: m.score?.fullTime?.home ?? null,
        away: m.score?.fullTime?.away ?? null,
        winner: m.score?.winner ?? null,
      },
    }))
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));

  const out = {
    fetchedAt: new Date().toISOString(),
    source: 'football-data.org v4 / competition WC',
    matches: schedule,
  };

  const file = path.join(__dirname, '..', 'data', 'fixtures', 'schedule.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${schedule.length} matches to ${path.relative(process.cwd(), file)}`);

  // Derive the scoring results (finished matches only) and write one file per
  // match day, overwriting. This is what feeds the leaderboard — the same fetch
  // updates both the Fixtures display and the scores.
  const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fixtures', 'matches.json')));
  const results = deriveResults(schedule, fixtures);
  const resultsDir = path.join(__dirname, '..', 'data', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const byDate = {};
  for (const r of results) (byDate[r.actualDate] ||= []).push(r);
  const days = Object.keys(byDate).sort();
  for (const day of days) {
    fs.writeFileSync(path.join(resultsDir, `${day}.json`), JSON.stringify(byDate[day], null, 2) + '\n');
  }
  console.log(`Derived ${results.length} finished result(s) across ${days.length} day(s)`
    + (days.length ? `: ${days.join(', ')}` : ' (none yet — pre-tournament)'));
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { deriveResults, winnerCode, isFinished, TLA_TO_CODE, TLA_TO_ISO2, STAGE_MAP };
