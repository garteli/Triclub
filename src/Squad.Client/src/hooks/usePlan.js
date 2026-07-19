import { useCallback, useEffect, useState } from 'react';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const COLOR = { bike: 'var(--bike)', swim: 'var(--swim)', run: 'var(--run)', gym: 'var(--gym)', rest: 'var(--text3)' };
const dur = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

// Maps a server plan row to the shape buildViewModel's plan section renders
// (see data/squadData.js planWeek). `wk` = discipline keys the workout-detail sheet.
function mapRow(r) {
  const d = new Date(r.date); // 'yyyy-MM-dd' parses as UTC
  return {
    id: r.id,
    day: DOW[d.getUTCDay()],
    date: String(d.getUTCDate()),
    disc: r.discipline,
    wk: r.discipline,
    title: `${cap(r.discipline)} · ${r.title}`.replace('Rest · ', ''),
    sub: r.sub || '',
    dur: dur(r.durationMin),
    load: String(r.load),
    status: r.status,
    color: COLOR[r.discipline] || 'var(--accent)',
  };
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Fetches the athlete's weekly plan (seeded server-side on first view).
export function usePlan({ getToken, enabled = true } = {}) {
  const [plan, setPlan] = useState(null);
  const [summary, setSummary] = useState(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const token = getToken ? await getToken() : null;
      const res = await fetch('/api/plan', { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) return;
      const data = await res.json();
      setPlan((data.week || []).map(mapRow));
      setSummary(data.summary || null);
    } catch { /* offline */ }
  }, [getToken, enabled]);

  useEffect(() => { refetch(); }, [refetch]);

  return { plan, summary };
}
