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

// Short per-match stage label (used by the leaderboard's today's-matches modal).
const STAGE_LABEL = {
  LAST_32:        'Round of 32',
  LAST_16:        'Round of 16',
  QUARTER_FINALS: 'Quarter-Final',
  SEMI_FINALS:    'Semi-Final',
  THIRD_PLACE:    '3rd-Place Play-Off',
  FINAL:          'Final',
};

const DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC',
});
const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
});
const FULL_DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC',
});

function shape(m) {
  const d = new Date(m.utcDate);
  const finished = m.status === 'FINISHED' || (m.score && m.score.home != null && m.score.away != null);
  return {
    id: m.id,
    dateIso: m.utcDate.slice(0, 10),    // "2026-06-11" (UTC), for day grouping
    dateLabel: DAY_FMT.format(d),       // e.g. "Thu, 11 Jun"
    timeLabel: TIME_FMT.format(d),      // e.g. "19:00"
    stageLabel: m.stage === 'GROUP_STAGE'
      ? `Group ${(m.group || '').replace('GROUP_', '')}`
      : (STAGE_LABEL[m.stage] || ''),
    status: m.status,
    home: m.home,                       // {tla,name,iso2} or null (TBD)
    away: m.away,
    finished,
    score: m.score,                     // {home,away,winner}
  };
}

const EMPTY_TODAY = { iso: null, isToday: false, label: null, matches: [] };

module.exports = () => {
  if (!fs.existsSync(FILE)) {
    return { available: false, groups: [], knockouts: [], fetchedAt: null, today: EMPTY_TODAY };
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

  // "Today" focus for the leaderboard entry modal: matches kicking off on the
  // build date (UTC); on a rest day, fall back to the next day that has any.
  const todayIso = new Date().toISOString().slice(0, 10);
  const shapedSorted = matches
    .slice()
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate))
    .map(shape);
  let focusMatches = shapedSorted.filter(m => m.dateIso === todayIso);
  const isToday = focusMatches.length > 0;
  if (!focusMatches.length) {
    const next = shapedSorted.find(m => m.dateIso > todayIso);
    if (next) focusMatches = shapedSorted.filter(m => m.dateIso === next.dateIso);
  }
  const focusIso = focusMatches.length ? focusMatches[0].dateIso : null;
  const today = {
    iso: focusIso,
    isToday,
    label: focusIso ? FULL_DAY_FMT.format(new Date(focusIso + 'T00:00:00Z')) : null,
    matches: focusMatches,
  };

  return {
    available: true,
    fetchedAt,
    fetchedAtShort: fetchedAt ? fetchedAt.slice(0, 16).replace('T', ' ') + 'Z' : null,
    groups,
    knockouts,
    today,
  };
};
