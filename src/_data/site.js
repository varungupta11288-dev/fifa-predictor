const START = '2026-06-11';
const END   = '2026-07-19';

function daysBetween(fromIso, toIso) {
  const a = new Date(fromIso + 'T00:00:00Z');
  const b = new Date(toIso + 'T00:00:00Z');
  return Math.round((b - a) / 86_400_000);
}

module.exports = () => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const toKickoff = daysBetween(todayIso, START);
  const fromKickoff = daysBetween(START, todayIso);
  const live = todayIso >= START && todayIso <= END;
  const finished = todayIso > END;

  let countdownLabel;
  if (finished) {
    countdownLabel = 'Tournament complete';
  } else if (live) {
    countdownLabel = `Matchday ${Math.max(1, fromKickoff + 1)} — tournament live`;
  } else if (toKickoff === 0) {
    countdownLabel = 'Kickoff today';
  } else if (toKickoff === 1) {
    countdownLabel = 'Kickoff tomorrow';
  } else {
    countdownLabel = `T-${toKickoff} days to kickoff`;
  }

  return {
    title: 'WC2026 Predictor',
    tournament: { start: START, end: END },
    daysToKickoff: toKickoff,
    tournamentLive: live,
    tournamentFinished: finished,
    countdownLabel,
    lastUpdated: new Date().toISOString(),
    lastUpdatedShort: new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z',
    baseUrl: process.env.SITE_BASE_URL || '',
  };
};
