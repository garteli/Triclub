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
    iso: r.date, // full 'yyyy-MM-dd' (month grid keys workout dots by real date)
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

// Fetches the athlete's weekly plan (empty until a plan is assigned). `weekStart`
// (a 'yyyy-MM-dd' in the target week) selects a week other than the current one for
// week-by-week date navigation; omit it for the current week.
export function usePlan({ getToken, enabled = true, weekStart, refreshSignal } = {}) {
  const [plan, setPlan] = useState(null);
  const [summary, setSummary] = useState(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const token = getToken ? await getToken() : null;
      const url = weekStart ? `/api/plan?weekStart=${encodeURIComponent(weekStart)}` : '/api/plan';
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) return;
      const data = await res.json();
      setPlan((data.week || []).map(mapRow));
      setSummary(data.summary || null);
    } catch { /* offline */ }
    // refreshSignal bumps on publish/unpublish/remove so the week refetches without a manual refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, enabled, weekStart, refreshSignal]);

  useEffect(() => { refetch(); }, [refetch]);

  return { plan, summary };
}
