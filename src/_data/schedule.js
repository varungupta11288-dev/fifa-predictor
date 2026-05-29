const fs = require('fs');
const path = require('path');

// Reads the committed football-data.org snapshot (data/fixtures/schedule.json,
// produced by scripts/fetch-schedule.js) and shapes it into ready-to-render
// sections for the Fixtures page: the group stage split by group, then each
// knockout round. All dates/times are formatted in UTC here so the template
// stays presentational.

const FILE = path.join(__dirname, '..', '..', 'data', 'fixtures', 'schedule.json');

// Knockout stages in bracket order, with display titles.
const KO_STAGES = [
  { key: 'LAST_32',        title: 'Round of 32' },
  { key: 'LAST_16',        title: 'Round of 16' },
  { key: 'QUARTER_FINALS', title: 'Quarter-Finals' },
  { key: 'SEMI_FINALS',    title: 'Semi-Finals' },
  { key: 'THIRD_PLACE',    title: '3rd-Place Play-Off' },
  { key: 'FINAL',          title: 'Final' },
];

const DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC',
});
const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
});

function shape(m) {
  const d = new Date(m.utcDate);
  const finished = m.status === 'FINISHED' || (m.score && m.score.home != null && m.score.away != null);
  return {
    id: m.id,
    dateLabel: DAY_FMT.format(d),       // e.g. "Thu, 11 Jun"
    timeLabel: TIME_FMT.format(d),      // e.g. "19:00"
    status: m.status,
    home: m.home,                       // {tla,name,iso2} or null (TBD)
    away: m.away,
    finished,
    score: m.score,                     // {home,away,winner}
  };
}

module.exports = () => {
  if (!fs.existsSync(FILE)) {
    return { available: false, groups: [], knockouts: [], fetchedAt: null };
  }
  const { matches, fetchedAt } = JSON.parse(fs.readFileSync(FILE));

  // Group stage → one section per group (A..L), matches in kickoff order.
  const byGroup = {};
  for (const m of matches) {
    if (m.stage !== 'GROUP_STAGE') continue;
    const letter = (m.group || '').replace('GROUP_', '');
    (byGroup[letter] ||= []).push(m);
  }
  const groups = Object.keys(byGroup).sort().map(letter => ({
    letter,
    title: `Group ${letter}`,
    matches: byGroup[letter]
      .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
      .map(shape),
  }));

  // Knockouts → one section per round, in bracket order.
  const knockouts = KO_STAGES.map(s => ({
    title: s.title,
    matches: matches
      .filter(m => m.stage === s.key)
      .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
      .map(shape),
  })).filter(s => s.matches.length > 0);

  return {
    available: true,
    fetchedAt,
    fetchedAtShort: fetchedAt ? fetchedAt.slice(0, 16).replace('T', ' ') + 'Z' : null,
    groups,
    knockouts,
  };
};
