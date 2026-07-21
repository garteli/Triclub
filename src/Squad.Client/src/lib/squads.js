// Squad/group API calls. Thin fetch wrappers; the caller supplies the bearer token.

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

export const listSquads = (token) => req('/api/squads', { token });
export const getSquad = (token, id) => req(`/api/squads/${id}`, { token });
export const createSquad = (token, body) => req('/api/squads', { method: 'POST', token, body });
export const joinSquad = (token, id) => req(`/api/squads/${id}/join`, { method: 'POST', token });
// Switch the athlete's active squad to one they already belong to (feed/leaderboard follow).
export const activateSquad = (token, id) => req(`/api/squads/${id}/activate`, { method: 'POST', token });

// Owner-side join-request management.
export const listRequests = (token) => req('/api/requests', { token });
export const approveRequest = (token, squadId, athleteId) => req(`/api/squads/${squadId}/requests/${athleteId}/approve`, { method: 'POST', token });
export const declineRequest = (token, squadId, athleteId) => req(`/api/squads/${squadId}/requests/${athleteId}/decline`, { method: 'POST', token });

// Owner-side group management: edit details/pricing + roster (add/remove members).
export const updateSquad = (token, id, body) => req(`/api/squads/${id}`, { method: 'PATCH', token, body });
export const listMembers = (token, id) => req(`/api/squads/${id}/members`, { token });
export const addMember = (token, id, email) => req(`/api/squads/${id}/members`, { method: 'POST', token, body: { email } });
export const removeMember = (token, id, athleteId) => req(`/api/squads/${id}/members/${athleteId}`, { method: 'DELETE', token });

// Logo / banner upload. dataUrl is a downscaled JPEG (see lib/photos.js downscaleToJpeg).
// kind is 'logo' | 'banner'. Returns { url }.
export async function uploadSquadImage(token, id, kind, blob) {
  const fd = new FormData();
  fd.append('file', blob, `${kind}.jpg`);
  const res = await fetch(`/api/squads/${id}/${kind}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return res.json().catch(() => ({}));
}
export const deleteSquadImage = (token, id, kind) => req(`/api/squads/${id}/${kind}`, { method: 'DELETE', token });

// Map a server SquadSummary to the shape the Discover / Group screens render
// (see data/squadData.js nearbyGroups). Price/rating are display strings already.
export function mapSquad(s) {
  return {
    id: s.id,
    name: s.name,
    loc: s.location || '',
    members: s.memberCount,
    disc: s.discipline,
    level: s.level || '',
    price: s.price || 'Free',
    per: s.perLabel || '',
    kind: s.kind,
    rating: s.rating || '—',
    color: s.color,
    member: s.isMember,
    owner: s.ownerId || null, // the squad owner == the coach who collects payment

    requestStatus: s.requestStatus || 'none', // none | pending | approved | declined
    description: s.description || '',
    logoUrl: s.logoUrl || null,     // proxy path to the club logo (null → gradient fallback)
    bannerUrl: s.bannerUrl || null, // proxy path to the club banner image
  };
}
