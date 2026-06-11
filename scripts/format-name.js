// Standardise a player's full name to Title Case for display.
// Source prediction JSON is left verbatim (email-matched / audit); this is a
// display-only transform applied at build time wherever a name is rendered.
//
// Algorithm: split on spaces, then on hyphens, and for each segment upper-case
// the first character and lower-case the rest. Idempotent — already-correct
// names pass through unchanged. Deliberately simple: no apostrophe / Mc / Mac
// special-casing, since those guesses (Macauley vs MacAuley) cause more harm
// than the rare miss they fix.

function titleCaseSegment(seg) {
  if (!seg) return seg;
  return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
}

function titleCaseName(name) {
  if (typeof name !== 'string') return name;
  return name
    .trim()
    .split(/\s+/)
    .map(word => word.split('-').map(titleCaseSegment).join('-'))
    .join(' ');
}

module.exports = { titleCaseName };
