import { useCallback, useEffect, useState } from 'react';

// Fetches a month's worth of plan dots ({ iso, disc }) for the calendar, so the month
// view can show the active plan on the weeks ahead (not just the current week). `month`
// is a 'yyyy-MM' string; omit for the current month. Returns [] until a plan is assigned.
export function usePlanMonth({ getToken, enabled = true, month, refreshSignal } = {}) {
  const [days, setDays] = useState([]);

  const refetch = useCallback(async () => {
    if (!enabled) { setDays([]); return; }
    try {
      const token = getToken ? await getToken() : null;
      const url = month ? `/api/plan/month?month=${encodeURIComponent(month)}` : '/api/plan/month';
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) return;
      const data = await res.json();
      setDays((data.days || []).map((d) => ({ iso: d.date, disc: d.discipline })));
    } catch { /* offline */ }
    // refreshSignal bumps on publish/unpublish/remove so the month refetches without a manual refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken, enabled, month, refreshSignal]);

  useEffect(() => { refetch(); }, [refetch]);

  return { monthDays: days };
}
