// Parse the canonical entry-sheet template into three fixture JSON files.
// Run: npm run parse-template
//
// Outputs (committed to repo):
//   data/fixtures/teams.json    — 48 teams, each with code + name + group
//   data/fixtures/groups.json   — 12 groups × 4 team codes
//   data/fixtures/matches.json  — 72 group matches + 32 knockout placeholders = 104

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { TEAM_CODES } = require('./team-codes');

const TEMPLATE_PATH = path.join(__dirname, '..', 'asset', 'WC2026_Predictor_Entry_Sheet (v1).xlsx');
const OUT_DIR = path.join(__dirname, '..', 'data', 'fixtures');

// Locked cell map — Appendix A of tasks/mvp-plan.md.
// Each group block: 6 match rows, with home-team col = scoreCol - 1, away-team col = scoreCol + 1.
const GROUP_BLOCKS = [
  { letter: 'A', rows: [5, 6, 7, 8, 9, 10],     homeScoreCol: 'B', awayScoreCol: 'D' },
  { letter: 'B', rows: [5, 6, 7, 8, 9, 10],     homeScoreCol: 'H', awayScoreCol: 'J' },
  { letter: 'C', rows: [5, 6, 7, 8, 9, 10],     homeScoreCol: 'N', awayScoreCol: 'P' },
  { letter: 'D', rows: [14, 15, 16, 17, 18, 19], homeScoreCol: 'B', awayScoreCol: 'D' },
  { letter: 'E', rows: [14, 15, 16, 17, 18, 19], homeScoreCol: 'H', awayScoreCol: 'J' },
  { letter: 'F', rows: [14, 15, 16, 17, 18, 19], homeScoreCol: 'N', awayScoreCol: 'P' },
  { letter: 'G', rows: [23, 24, 25, 26, 27, 28], homeScoreCol: 'B', awayScoreCol: 'D' },
  { letter: 'H', rows: [23, 24, 25, 26, 27, 28], homeScoreCol: 'H', awayScoreCol: 'J' },
  { letter: 'I', rows: [23, 24, 25, 26, 27, 28], homeScoreCol: 'N', awayScoreCol: 'P' },
  { letter: 'J', rows: [32, 33, 34, 35, 36, 37], homeScoreCol: 'B', awayScoreCol: 'D' },
  { letter: 'K', rows: [32, 33, 34, 35, 36, 37], homeScoreCol: 'H', awayScoreCol: 'J' },
  { letter: 'L', rows: [32, 33, 34, 35, 36, 37], homeScoreCol: 'N', awayScoreCol: 'P' },
];

function colShift(letter, delta) {
  return String.fromCharCode(letter.charCodeAt(0) + delta);
}

function cellValue(ws, ref) {
  const c = ws[ref];
  return c == null ? undefined : c.v;
}

function getCode(name) {
  if (!(name in TEAM_CODES)) {
    throw new Error(`Unknown team name in template: "${name}". Add it to scripts/team-codes.js.`);
  }
  return TEAM_CODES[name];
}

function parse() {
  const wb = XLSX.readFile(TEMPLATE_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];

  const teamsByCode = new Map(); // code → { code, name, group }
  const groupsByLetter = new Map(); // letter → Set<code>
  const groupMatches = [];

  for (const block of GROUP_BLOCKS) {
    const homeTeamCol = colShift(block.homeScoreCol, -1);
    const awayTeamCol = colShift(block.awayScoreCol, +1);

    if (!groupsByLetter.has(block.letter)) groupsByLetter.set(block.letter, new Set());
    const groupSet = groupsByLetter.get(block.letter);

    block.rows.forEach((row, i) => {
      const homeName = cellValue(ws, homeTeamCol + row);
      const awayName = cellValue(ws, awayTeamCol + row);
      if (!homeName || !awayName) {
        throw new Error(`Empty team cell in Group ${block.letter} row ${row} (home=${homeTeamCol}${row}, away=${awayTeamCol}${row})`);
      }
      const homeCode = getCode(homeName);
      const awayCode = getCode(awayName);

      for (const [code, name] of [[homeCode, homeName], [awayCode, awayName]]) {
        if (!teamsByCode.has(code)) {
          teamsByCode.set(code, { code, name, group: block.letter });
        } else {
          const existing = teamsByCode.get(code);
          if (existing.group !== block.letter) {
            throw new Error(`Team ${code} appears in groups ${existing.group} and ${block.letter}`);
          }
        }
        groupSet.add(code);
      }

      groupMatches.push({
        id: `G-${block.letter}-${i + 1}`,
        stage: 'group',
        group: block.letter,
        home: homeCode,
        away: awayCode,
      });
    });
  }

  const teams = [...teamsByCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  const groups = [...groupsByLetter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, set]) => ({ group: letter, teams: [...set].sort() }));

  // Knockout placeholders. The 2026 WC bracket has:
  //   16 R32 matches, 8 R16, 4 QF, 2 SF, 1 Final, 1 3rd-place play-off = 32 KO matches.
  // Labels are deliberately generic — the bracket-position-to-group mapping comes later.
  const knockout = [
    ...Array.from({ length: 16 }, (_, i) => ({
      id: `R32-${String(i + 1).padStart(2, '0')}`,
      stage: 'r32',
      label: `Round of 32 — Match ${i + 1}`,
      home: null,
      away: null,
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `R16-${String(i + 1).padStart(2, '0')}`,
      stage: 'r16',
      label: `Round of 16 — Match ${i + 1}`,
      home: null,
      away: null,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `QF-${i + 1}`,
      stage: 'qf',
      label: `Quarter-Final ${i + 1}`,
      home: null,
      away: null,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: `SF-${i + 1}`,
      stage: 'sf',
      label: `Semi-Final ${i + 1}`,
      home: null,
      away: null,
    })),
    { id: 'F-1', stage: 'final', label: 'Final', home: null, away: null },
    { id: 'F-3', stage: '3rd', label: '3rd-Place Play-Off', home: null, away: null },
  ];

  const matches = [...groupMatches, ...knockout];

  // Validation — fail loudly if any of these break.
  if (teams.length !== 48) {
    throw new Error(`Expected 48 teams, got ${teams.length}`);
  }
  if (groups.length !== 12) {
    throw new Error(`Expected 12 groups, got ${groups.length}`);
  }
  for (const g of groups) {
    if (g.teams.length !== 4) {
      throw new Error(`Group ${g.group} has ${g.teams.length} teams, expected 4`);
    }
  }
  if (groupMatches.length !== 72) {
    throw new Error(`Expected 72 group matches, got ${groupMatches.length}`);
  }
  if (matches.length !== 104) {
    throw new Error(`Expected 104 total matches, got ${matches.length}`);
  }
  // Cross-check team membership
  const teamSet = new Set(teams.map(t => t.code));
  for (const g of groups) {
    for (const code of g.teams) {
      if (!teamSet.has(code)) throw new Error(`Group ${g.group} references unknown team ${code}`);
    }
  }
  for (const m of groupMatches) {
    if (!teamSet.has(m.home) || !teamSet.has(m.away)) {
      throw new Error(`Match ${m.id} references unknown team`);
    }
  }

  return { teams, groups, matches };
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const { teams, groups, matches } = parse();

  fs.writeFileSync(path.join(OUT_DIR, 'teams.json'), JSON.stringify(teams, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT_DIR, 'groups.json'), JSON.stringify(groups, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT_DIR, 'matches.json'), JSON.stringify(matches, null, 2) + '\n');

  console.log(`[OK] Wrote ${teams.length} teams, ${groups.length} groups, ${matches.length} matches to ${path.relative(process.cwd(), OUT_DIR)}/`);
}

if (require.main === module) main();
module.exports = { parse };
