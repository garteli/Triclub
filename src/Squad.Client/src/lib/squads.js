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

// Owner-side join-request management.
export const listRequests = (token) => req('/api/requests', { token });
export const approveRequest = (token, squadId, athleteId) => req(`/api/squads/${squadId}/requests/${athleteId}/approve`, { method: 'POST', token });
export const declineRequest = (token, squadId, athleteId) => req(`/api/squads/${squadId}/requests/${athleteId}/decline`, { method: 'POST', token });

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
    requestStatus: s.requestStatus || 'none', // none | pending | approved | declined
    description: s.description || '',
  };
}
