// Reverse-geocode a [lat, lon] to a short human place name (the nearest locality / town) for
// labelling a route's start point. Uses BigDataCloud's key-less reverse-geocode-client endpoint —
// CORS-enabled and built for client-side use with a generous free tier, matching the app's other
// no-key providers (Open-Meteo for terrain/weather). Returns a string, or null if it can't resolve.
// Results are cached per rounded coordinate so a given start point is only fetched once.

const cache = new Map();

// Pick the most specific, still-readable name from the BigDataCloud payload — the nearest town /
// locality. Falls back through the administrative hierarchy so we always return something.
function pickName(d) {
  if (!d) return null;
  return d.locality || d.city || d.principalSubdivision || d.countryName || null;
}

export async function reverseGeocode(lat, lon, signal) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { signal },
    );
    if (!res.ok) throw new Error('geocode');
    const name = pickName(await res.json());
    cache.set(key, name);
    return name;
  } catch {
    return null; // offline / blocked / aborted — caller shows a neutral fallback
  }
}
