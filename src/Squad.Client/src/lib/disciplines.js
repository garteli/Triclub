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
