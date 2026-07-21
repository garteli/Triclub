// Saved routes/courses API. Thin fetch wrappers; the caller supplies the bearer token.

async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// → [{ id, name, distanceKm, pointCount, createdUtc }]
export const listCourses = (token) => req('/api/courses', { token });
// → { id, name, distanceKm, points: [[lat,lon],…] }
export const getCourse = (token, id) => req(`/api/courses/${id}`, { token });
// body: { name, points: [[lat,lon],…], distanceKm? } → { id, name, ... }
export const createCourse = (token, body) => req('/api/courses', { method: 'POST', token, body });
export const deleteCourse = (token, id) => req(`/api/courses/${id}`, { method: 'DELETE', token });

// Parse a GPX file's <trkpt>/<rtept> lat/lon into a [[lat,lon],…] array (client-side, no lib).
export function parseGpx(text) {
  const out = [];
  const re = /<(?:trkpt|rtept)\b[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const lat = parseFloat(m[1]); const lon = parseFloat(m[2]);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) out.push([lat, lon]);
  }
  return out;
}
