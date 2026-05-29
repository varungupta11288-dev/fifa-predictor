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
  SEN: 'sn', SUI: 'ch', SWE: 'se', TUN: 'tn', TUR: 'tr', URY: 'uy', USA: 'us',
  UZB: 'uz',
};

function team(t) {
  if (!t || !t.tla) return null;
  const iso2 = TLA_TO_ISO2[t.tla];
  if (!iso2) console.warn(`[fetch-schedule] no flag mapping for TLA "${t.tla}" (${t.name})`);
  return { tla: t.tla, name: t.shortName || t.name, iso2: iso2 || null };
}

(async () => {
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
})();
