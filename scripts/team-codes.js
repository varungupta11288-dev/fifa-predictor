// Canonical 48-team name → 3-letter code lookup.
// Uses ISO 3166-1 alpha-3 where it exists; FIFA codes for the home-nations (England, Scotland).
// The plan example uses ZAF for South Africa (ISO), so we lean ISO throughout.

const TEAM_CODES = {
  // Group A
  'Mexico': 'MEX',
  'South Korea': 'KOR',
  'Czechia': 'CZE',
  'South Africa': 'ZAF',
  // Group B
  'Canada': 'CAN',
  'Qatar': 'QAT',
  'Switzerland': 'CHE',
  'Bosnia & Herz.': 'BIH',
  // Group C
  'Brazil': 'BRA',
  'Haiti': 'HTI',
  'Scotland': 'SCO',
  'Morocco': 'MAR',
  // Group D
  'United States': 'USA',
  'Australia': 'AUS',
  'Turkiye': 'TUR',
  'Paraguay': 'PRY',
  // Group E
  'Germany': 'DEU',
  'Ivory Coast': 'CIV',
  'Ecuador': 'ECU',
  'Curacao': 'CUW',
  // Group F
  'Netherlands': 'NLD',
  'Sweden': 'SWE',
  'Tunisia': 'TUN',
  'Japan': 'JPN',
  // Group G
  'Belgium': 'BEL',
  'Iran': 'IRN',
  'New Zealand': 'NZL',
  'Egypt': 'EGY',
  // Group H
  'Spain': 'ESP',
  'Saudi Arabia': 'SAU',
  'Uruguay': 'URY',
  'Cape Verde': 'CPV',
  // Group I
  'France': 'FRA',
  'Iraq': 'IRQ',
  'Norway': 'NOR',
  'Senegal': 'SEN',
  // Group J
  'Argentina': 'ARG',
  'Austria': 'AUT',
  'Jordan': 'JOR',
  'Algeria': 'DZA',
  // Group K
  'Portugal': 'PRT',
  'Uzbekistan': 'UZB',
  'DR Congo': 'COD',
  'Colombia': 'COL',
  // Group L
  'England': 'ENG',
  'Ghana': 'GHA',
  'Panama': 'PAN',
  'Croatia': 'HRV',
};

module.exports = { TEAM_CODES };
