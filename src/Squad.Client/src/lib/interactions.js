// Activity social layer — kudos + comments. Thin wrappers over the squad-scoped
// endpoints under /api/activities/{id}. All take the bearer token (the caller
// resolves it via getToken); the global fetch shim prefixes /api on native.

const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : undefined);

// Toggle kudos on an activity. give=true → POST, give=false → DELETE.
// Returns the fresh { count, kudoed } state.
export async function setKudos(activityId, give, token) {
  const res = await fetch(`/api/activities/${activityId}/kudos`, {
    method: give ? 'POST' : 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(`Kudos failed (${res.status})`);
  return res.json();
}

// The activity's comment thread, oldest-first (enriched with author display fields).
export async function fetchComments(activityId, token) {
  const res = await fetch(`/api/activities/${activityId}/comments`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Comments failed (${res.status})`);
  return res.json();
}

// Post a comment; returns the created (enriched) comment.
export async function postComment(activityId, body, token) {
  const res = await fetch(`/api/activities/${activityId}/comments`, {
    method: 'POST',
    headers: { ...(authHeaders(token) || {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`Post comment failed (${res.status})`);
  return res.json();
}
