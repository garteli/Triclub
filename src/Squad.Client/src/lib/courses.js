// Saved routes/courses API. Thin fetch wrappers; the caller supplies the bearer token.

import { haversineMeters } from './geo.js';

// Total length (km) of a [[lat,lon],…] polyline.
export function routeKm(points) {
  const pts = (points || []).filter((p) => Array.isArray(p) && p.length >= 2);
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += haversineMeters({ lat: pts[i - 1][0], lon: pts[i - 1][1] }, { lat: pts[i][0], lon: pts[i][1] });
  return m / 1000;
}

// A friendly default course name derived from the route geometry itself: total distance plus
// whether it returns near its start (a loop) or runs point-to-point. e.g. "24 km loop", "8.5 km route".
export function courseNameFromPoints(points) {
  const pts = (points || []).filter((p) => Array.isArray(p) && p.length >= 2);
  if (pts.length < 2) return 'Route';
  const km = routeKm(pts);
  const startEnd = haversineMeters({ lat: pts[0][0], lon: pts[0][1] }, { lat: pts[pts.length - 1][0], lon: pts[pts.length - 1][1] });
  // "loop" when the end comes back near the start (within 200 m, or 5% of the ride for big loops).
  const isLoop = pts.length > 3 && startEnd < Math.max(200, km * 1000 * 0.05);
  const dist = km >= 10 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${dist} km ${isLoop ? 'loop' : 'route'}`;
}

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

// Import a route from an external link (a GPX URL, or an off-road.io track page) — the server fetches
// and parses it (the browser can't: those hosts send no CORS headers) and saves it as a course.
// body: { url } → { id, name, distanceKm, pointCount }
export const importCourseFromUrl = (token, url) => req('/api/courses/import', { method: 'POST', token, body: { url } });

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
