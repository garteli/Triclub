// Ad-hoc segment leaderboard. Given a route section's polyline, the server finds every rider whose
// stored GPS track covered that same stretch, times their effort and ranks them. No stored segments.

// body: { scope: 'squad'|'all'|'year', sport: <byte 1..3>, lengthM, path: [[lat,lon],…] }
// → { efforts: [{ athleteId, name, initials, avatarColor, avatarUrl, timeSec, avgSpeedKph, whenUtc, isMe }] }
export async function segmentBoard(token, body) {
  const res = await fetch('/api/segments/board', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Segment board failed (${res.status})`);
  return res.json();
}
