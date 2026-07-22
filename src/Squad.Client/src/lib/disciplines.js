// Canonical club disciplines — the single source shared by the Register-a-group
// wizard, Discover filters, and the cross-club ranking (which ranks clubs against
// same-discipline peers). The endurance disciplines the app started with, plus
// motorcycle disciplines (off-road / touring / road).
export const DISCIPLINES = [
  'Cycling', 'Triathlon', 'Swim', 'Run',
  'Moto Road', 'Moto Touring', 'Moto Off-road',
];

// Accent colour per discipline — drives the club tile / chip / created-squad colour.
export const DISC_COLOR = {
  Cycling: '#ffce4a', Triathlon: '#ff6a2c', Swim: '#37c0ff', Run: '#ff6f61',
  'Moto Road': '#8b5cf6', 'Moto Touring': '#22c39a', 'Moto Off-road': '#e0692a',
};

export const discColor = (d) => DISC_COLOR[d] || '#ff6a2c';

// ---------------------------------------------------------------------------
//  Discipline families. The app runs in one of two worlds — endurance
//  (cycling / triathlon / swim / run) or motorsport (motorcycle road / touring
//  / off-road) — and keys terminology, which metrics show, visual identity, and
//  Discover/ranking grouping off the *active club's* family. Everything that
//  needs to differ between the two reads from FAMILY[familyOf(disc)].
// ---------------------------------------------------------------------------
const FAMILY_OF = {
  Cycling: 'endurance', Triathlon: 'endurance', Swim: 'endurance', Run: 'endurance',
  'Moto Road': 'motorsport', 'Moto Touring': 'motorsport', 'Moto Off-road': 'motorsport',
};

export const FAMILY = {
  endurance: {
    id: 'endurance',
    label: 'Endurance',
    accent: '#ff6a2c',
    glyph: 'bike',        // SportIcon name for the club mark
    // Per-discipline swim/bike/run load breakdown is meaningful here.
    splits: true,
    // User-facing nouns (terminology that swaps by family).
    activityNoun: 'activities',
    ranksTitle: 'Team Ranks',
  },
  motorsport: {
    id: 'motorsport',
    label: 'Motorsport',
    accent: '#8b5cf6',
    glyph: 'moto',
    splits: false,
    activityNoun: 'rides',
    ranksTitle: 'Rider Ranks',
  },
};

// Discipline → family id ('endurance' | 'motorsport'); unknown/blank → endurance.
export const familyOf = (disc) => FAMILY_OF[disc] || 'endurance';
// Discipline → its family's metadata block (the object above).
export const familyMeta = (disc) => FAMILY[familyOf(disc)];
// The disciplines belonging to a family id, in canonical order.
export const disciplinesInFamily = (familyId) => DISCIPLINES.filter((d) => familyOf(d) === familyId);
