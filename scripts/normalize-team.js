// Resolve a free-text team name from a knockout cell to a canonical team code.
// Pipeline: trim → strip diacritics → lowercase → alias-table → exact match → Levenshtein ≤ 2 → null.

const { TEAM_CODES } = require('./team-codes');

// Hardcoded aliases for known variants. Keys are normalized (lowercase, no diacritics, trimmed).
const ALIASES = {
  'usa': 'United States',
  'us': 'United States',
  'united states of america': 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  'south korea': 'South Korea',
  'korea': 'South Korea',
  'korea republic': 'South Korea',
  'republic of korea': 'South Korea',
  'czech republic': 'Czechia',
  'czechia': 'Czechia',
  'bosnia': 'Bosnia & Herz.',
  'bosnia & herz.': 'Bosnia & Herz.',
  'bosnia and herzegovina': 'Bosnia & Herz.',
  'brasil': 'Brazil',
  'cote divoire': 'Ivory Coast',
  'cote d ivoire': 'Ivory Coast',
  "cote d'ivoire": 'Ivory Coast',
  'ivory coast': 'Ivory Coast',
  'turkiye': 'Turkiye',
  'turkey': 'Turkiye',
  'türkiye': 'Turkiye',
  'curacao': 'Curacao',
  'curaçao': 'Curacao',
  'netherlands': 'Netherlands',
  'holland': 'Netherlands',
  'iran': 'Iran',
  'islamic republic of iran': 'Iran',
  'cape verde': 'Cape Verde',
  'cabo verde': 'Cape Verde',
  'dr congo': 'DR Congo',
  'democratic republic of the congo': 'DR Congo',
  'd.r. congo': 'DR Congo',
  'south africa': 'South Africa',
  'rsa': 'South Africa',
  'algeria': 'Algeria',
  'portugal': 'Portugal',
  'saudi arabia': 'Saudi Arabia',
  'new zealand': 'New Zealand',
};

function normalize(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 &.']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

// Returns { code, source } where source is one of 'alias' | 'exact' | 'fuzzy', or null on failure.
function resolveTeam(input) {
  if (input == null || String(input).trim() === '') return null;
  const norm = normalize(input);

  if (ALIASES[norm]) {
    const canonical = ALIASES[norm];
    const aliased = normalize(canonical) === norm ? 'exact' : 'alias';
    return { code: TEAM_CODES[canonical], canonical, source: aliased };
  }

  // Exact match against canonical team names
  for (const [name, code] of Object.entries(TEAM_CODES)) {
    if (normalize(name) === norm) return { code, canonical: name, source: 'exact' };
  }

  // Levenshtein fallback ≤ 2 distance against canonical names
  let best = null;
  for (const [name, code] of Object.entries(TEAM_CODES)) {
    const d = levenshtein(norm, normalize(name));
    if (d <= 2 && (best == null || d < best.distance)) {
      best = { code, canonical: name, source: 'fuzzy', distance: d };
    }
  }
  if (best) {
    const { distance, ...result } = best;
    return result;
  }
  return null;
}

module.exports = { resolveTeam, normalize, levenshtein, ALIASES };
