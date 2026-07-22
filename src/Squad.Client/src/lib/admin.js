// Sysadmin console API calls (/api/admin). Thin fetch wrappers; the caller supplies the
// bearer token. Every route is 403 for non-admins server-side, so these only work for the
// small allowlist of sysadmin accounts (the client also hides the entry via session.isAdmin).

async function req(path, { method = 'GET', token } = {}) {
  const res = await fetch(path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const adminOverview = (token) => req('/api/admin/overview', { token });
export const adminListUsers = (token, search) =>
  req(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`, { token });
export const adminListSquads = (token) => req('/api/admin/squads', { token });
export const adminSquadMembers = (token, id) => req(`/api/admin/squads/${id}/members`, { token });

export const adminDeleteSquad = (token, id) => req(`/api/admin/squads/${id}`, { method: 'DELETE', token });
export const adminRemoveMember = (token, id, athleteId) =>
  req(`/api/admin/squads/${id}/members/${athleteId}`, { method: 'DELETE', token });
export const adminDeleteUser = (token, id) => req(`/api/admin/users/${id}`, { method: 'DELETE', token });
