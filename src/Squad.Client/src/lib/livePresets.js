// Pro-inspired live-ride page presets — a gallery of ready-made page designs a rider can
// drop into their ride, each built around how a given Tour-style discipline actually races.
//
// Framing note: these are ARCHETYPES (the sprinter, the climber, the time-trialist…), not
// real named riders. We don't attribute a "favorite layout" to a real person — that would be
// fabricated (same reason the app's data is real-or-empty). The persona is the riding role;
// the `tag` is the plain functional name; `blurb` says what the page is tuned for.
//
// Each preset's `pages` are ordinary page objects — the exact shape useLivePages stores:
//   { name, side:'none'|'group', layout:'grid'|'hero'|'free', heroIndex?, fields:[token] }
// Field tokens are the same vocabulary the field picker uses (metricCatalog ids, 'chart:*',
// 'map', 'map+elev', 'peloton', 'radar', 'climbpro', 'elev:*'). Hero pages keep an odd field
// count so the full-width hero sits above complete rows of two (see balanceHero()).

export const LIVE_PRESETS = [
  {
    id: 'sprinter',
    persona: 'The Sprinter',
    tag: 'Pro Sprint',
    emoji: '⚡',
    accent: '#35c7f0',
    blurb: 'Built for the finalé — instantaneous speed and raw watts front and centre for the kick to the line.',
    pages: [
      { name: 'Sprint', side: 'none', layout: 'hero', heroIndex: 0, fields: ['spd', 'pwr', 'pwr3s', 'cad', 'hr', 'maxspd', 'avgspd'] },
    ],
  },
  {
    id: 'climber',
    persona: 'The Climber',
    tag: 'Pro Climb',
    emoji: '⛰️',
    accent: '#ff7a3c',
    blurb: 'A grimpeur\'s page — gradient, W/kg and VAM up top so you can meter the effort all the way to the summit.',
    pages: [
      { name: 'Climb', side: 'none', layout: 'hero', heroIndex: 0, fields: ['grad', 'pwrwkg', 'vspd', 'hr', 'elevgain', 'cad', 'spd'] },
    ],
  },
  {
    id: 'tt',
    persona: 'The Time-Trialist',
    tag: 'Pro TT',
    emoji: '⏱️',
    accent: '#ff9e2c',
    blurb: 'The race of truth — normalised power, IF and speed on a clean, distraction-free page. Pairs well with Mono.',
    pages: [
      { name: 'TT', side: 'none', layout: 'hero', heroIndex: 0, fields: ['pwr', 'np', 'spd', 'avgspd', 'cad', 'iff', 'time'] },
    ],
  },
  {
    id: 'gc',
    persona: 'The GC Leader',
    tag: 'Pro GC',
    emoji: '🏆',
    accent: '#9b7bff',
    blurb: 'Race-control view — power and HR beside your gap and place in the pack, with the group rail alongside.',
    pages: [
      { name: 'GC', side: 'group', layout: 'grid', fields: ['pwr', 'hr', 'gap', 'packpos', 'grad', 'spd'] },
    ],
  },
  {
    id: 'domestique',
    persona: 'The Domestique',
    tag: 'Pro Team',
    emoji: '🤝',
    accent: '#17c9a0',
    blurb: 'Eyes on the team — who\'s on the front, your gap to the leader and your share of time pulling.',
    pages: [
      { name: 'Team', side: 'group', layout: 'grid', fields: ['leader', 'gap', 'packpos', 'leadpct', 'spd', 'hr'] },
    ],
  },
  {
    id: 'descender',
    persona: 'The Descender',
    tag: 'Pro Descent',
    emoji: '🏂',
    accent: '#ff5064',
    blurb: 'Full-map descent page with the group + rear-radar rail — line, speed and gradient, eyes up.',
    pages: [
      { name: 'Descent', side: 'group', layout: 'grid', fields: ['spd', 'grad', 'maxspd', 'map'] },
    ],
  },
];

// Full multi-page setups — a complete race-day configuration you can drop in as new pages, or
// swap in wholesale (Replace all). Same page shape as above; composed from the discipline designs.
export const LIVE_PRESET_SETS = [
  {
    id: 'grandtour',
    persona: 'Grand Tour',
    tag: 'GC setup',
    emoji: '🏔️',
    accent: '#9b7bff',
    blurb: 'A full race-day set — a power-led race page, a climb page, group control and the route map.',
    pages: [
      { name: 'Race', side: 'group', layout: 'hero', heroIndex: 0, fields: ['pwr', 'spd', 'hr', 'grad', 'cad', 'gap', 'packpos'] },
      { name: 'Climb', side: 'none', layout: 'hero', heroIndex: 0, fields: ['grad', 'pwrwkg', 'vspd', 'hr', 'elevgain', 'cad', 'spd'] },
      { name: 'GC', side: 'group', layout: 'grid', fields: ['leader', 'gap', 'packpos', 'leadpct', 'pwr', 'hr'] },
      { name: 'Map', side: 'group', layout: 'grid', fields: ['map'] },
    ],
  },
  {
    id: 'ttday',
    persona: 'Time Trial',
    tag: 'Race of truth',
    emoji: '⏱️',
    accent: '#ff9e2c',
    blurb: 'Against the clock — a clean power page, the trend charts and the route. Pairs well with Mono.',
    pages: [
      { name: 'TT', side: 'none', layout: 'hero', heroIndex: 0, fields: ['pwr', 'np', 'spd', 'avgspd', 'cad', 'iff', 'time'] },
      { name: 'Charts', side: 'none', layout: 'grid', fields: ['chart:spd', 'chart:hr', 'chart:power'] },
      { name: 'Map', side: 'none', layout: 'grid', fields: ['map+elev'] },
    ],
  },
  {
    id: 'sprintday',
    persona: 'Sprinter\'s Day',
    tag: 'Bunch finish',
    emoji: '⚡',
    accent: '#35c7f0',
    blurb: 'A flat-stage set — a sprint page, team positioning and the map to read the run-in.',
    pages: [
      { name: 'Sprint', side: 'none', layout: 'hero', heroIndex: 0, fields: ['spd', 'pwr', 'pwr3s', 'cad', 'hr', 'maxspd', 'avgspd'] },
      { name: 'Team', side: 'group', layout: 'grid', fields: ['leader', 'gap', 'packpos', 'leadpct', 'spd', 'hr'] },
      { name: 'Map', side: 'group', layout: 'grid', fields: ['map'] },
    ],
  },
];

// Short human labels for the tiny layout preview chips in the gallery. Charts/map/special
// tiles get a friendly name; plain metrics fall back to the catalogue label (looked up by the
// caller, which already imports metricCatalog).
export const PRESET_TOKEN_LABEL = {
  map: 'Map', 'map+elev': 'Map+', peloton: 'Peloton', radar: 'Radar', climbpro: 'Climb',
  'chart:spd': 'Spd ~', 'chart:hr': 'HR ~', 'chart:power': 'Pwr ~', 'elev:track': 'Elev', 'elev:route': 'Elev',
};
