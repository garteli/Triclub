// Shared real-world geography for the maps. The live group ride and its map fields
// all reference one loop (so basemap, route and rider dots agree), and each named
// activity location gets a real anchor + a stable, road-like loop until real GPS /
// summary-polyline data is wired through the ingest pipeline.

// ---- live group ride: a loop in the Lower Galilee, near Kfar Tavor ----
export const RIDE_CENTER = { lat: 32.72, lon: 35.53 };
const R_LAT = 0.010, R_LON = 0.014;

export function ridePointAt(u) {
  const a = 2 * Math.PI * u;
  return { lat: RIDE_CENTER.lat + R_LAT * Math.cos(a), lon: RIDE_CENTER.lon + R_LON * Math.sin(a) };
}

// Static course polyline sampled once around the loop ([lat,lon] pairs).
export const RIDE_ROUTE = Array.from({ length: 48 }, (_, i) => {
  const p = ridePointAt(i / 48);
  return [p.lat, p.lon];
});

// ---- starred climb segment near the Kaza dam (a line, not a loop) ----
export const SEGMENT_CLIMB = [
  [32.7055, 35.5115], [32.7082, 35.5165], [32.7108, 35.5212],
  [32.7141, 35.5258], [32.7176, 35.5305], [32.7212, 35.5352], [32.7248, 35.5405],
];

// ---- activity locations → real anchor coordinates (Lower Galilee / Carmel) ----
export const PLACE_ANCHORS = {
  'Kaza reservoir loop': [32.720, 35.530],
  'Tabor foothills': [32.686, 35.400],
  'Riverside path': [32.710, 35.575],
  'Galilee pool': [32.790, 35.530],
  'Kfar Tavor': [32.686, 35.420],
  'Haifa ridge': [32.760, 35.020],
};
const DEFAULT_ANCHOR = [RIDE_CENTER.lat, RIDE_CENTER.lon];

export function anchorFor(location) {
  return PLACE_ANCHORS[location] || DEFAULT_ANCHOR;
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) | 0;
  return h;
}

// Deterministic loop anchored on a real place — seeded by id so each activity keeps a
// distinct but stable shape across renders. spanKm sets roughly how much ground it
// covers so a long ride frames wider than a short run.
export function activityRoute(id, anchor, spanKm = 3) {
  const [lat, lon] = anchor;
  const seed = hash(id) % 1000 / 160;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const rLat = (spanKm / 111) * 0.5;
  const rLon = rLat / cosLat;
  const N = 44;
  return Array.from({ length: N + 1 }, (_, i) => {
    const a = 2 * Math.PI * (i / N);
    const wob = 1 + 0.26 * Math.sin(3 * a + seed) + 0.15 * Math.cos(5 * a + seed * 1.7);
    return [lat + rLat * wob * Math.cos(a), lon + rLon * wob * Math.sin(a)];
  });
}
