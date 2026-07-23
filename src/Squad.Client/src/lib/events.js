// Ad-hoc group session (event) API calls. Thin fetch wrappers; the caller supplies the bearer token.
// Coach (squad owner) schedules a session with a route + sport + date/time and publishes it to the
// squad; members join and, on the day, check in.

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

// Turn a datetime-local value ("2026-07-25T07:00") into an ISO 8601 string that carries the
// browser's UTC offset ("2026-07-25T07:00:00+03:00"), so the server stores the coach's local
// intent and the day-of check-in gate lines up with the member's calendar.
export function toOffsetIso(local) {
  if (!local) return null;
  const d = new Date(local); // parsed as local time
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  const tz = -d.getTimezoneOffset();        // minutes east of UTC
  const sign = tz >= 0 ? '+' : '-';
  const abs = Math.abs(tz);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`;
}

// Turn a stored offset-ISO start back into a datetime-local value ("2026-07-25T07:00") for the
// editor's <input type="datetime-local"> when editing an existing event.
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// → [{ id, squadId, title, sport, start, courseId, courseName, courseKm, notes, joinCount, checkedInCount, joined, checkedIn, published }]
// For the squad owner this includes their own unpublished drafts; members see published events only.
export const listSquadEvents = (token, squadId) => req(`/api/squads/${squadId}/events`, { token });
// body: { title, sport, start (offset ISO), courseId?, notes?, published? } → the created event.
export const createSquadEvent = (token, squadId, body) => req(`/api/squads/${squadId}/events`, { method: 'POST', token, body });
// body: { title, sport, start (offset ISO), courseId?, notes? } — edit an event (publish state kept).
export const updateSquadEvent = (token, squadId, eventId, body) => req(`/api/squads/${squadId}/events/${eventId}`, { method: 'PUT', token, body });
export const publishEvent = (token, squadId, eventId) => req(`/api/squads/${squadId}/events/${eventId}/publish`, { method: 'POST', token });
export const unpublishEvent = (token, squadId, eventId) => req(`/api/squads/${squadId}/events/${eventId}/unpublish`, { method: 'POST', token });
// Owner-only join/check-in roster → [{ athleteId, name, initials, avatarColor, avatarUrl, joinedUtc, checkedIn, checkedInUtc }]
export const listEventAttendees = (token, squadId, eventId) => req(`/api/squads/${squadId}/events/${eventId}/attendees`, { token });
// Member-facing participant roster (the event page) → [{ athleteId, name, initials, avatarColor, avatarUrl, checkedIn, you }]
export const listEventParticipants = (token, squadId, eventId) => req(`/api/squads/${squadId}/events/${eventId}/participants`, { token });
// The event's denormalized route for the event-page map → { points: [[lat,lon],…] }. Visible to any
// member who can see the event (unlike /api/courses/{id}, which is owner-scoped). 404 → no route.
export const getEventRoute = (token, squadId, eventId) => req(`/api/squads/${squadId}/events/${eventId}/route`, { token });

// Per-event branding (owner-only). kind is 'logo' | 'banner'; blob is a downscaled JPEG. Returns { url }.
export async function uploadEventImage(token, squadId, eventId, kind, blob) {
  const fd = new FormData();
  fd.append('file', blob, `${kind}.jpg`);
  const res = await fetch(`/api/squads/${squadId}/events/${eventId}/${kind}`, {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: fd,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return res.json().catch(() => ({}));
}
export const deleteEventImage = (token, squadId, eventId, kind) => req(`/api/squads/${squadId}/events/${eventId}/${kind}`, { method: 'DELETE', token });
export const deleteSquadEvent = (token, squadId, eventId) => req(`/api/squads/${squadId}/events/${eventId}`, { method: 'DELETE', token });

export const joinEvent = (token, eventId) => req(`/api/events/${eventId}/join`, { method: 'POST', token });
export const leaveEvent = (token, eventId) => req(`/api/events/${eventId}/leave`, { method: 'POST', token });
export const checkInEvent = (token, eventId) => req(`/api/events/${eventId}/checkin`, { method: 'POST', token });
export const undoCheckInEvent = (token, eventId) => req(`/api/events/${eventId}/uncheckin`, { method: 'POST', token });

// The caller's joined upcoming events across every squad, soonest first.
export const listMyEvents = (token) => req('/api/events/mine', { token });
