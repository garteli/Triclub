import { useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import FeedActivityCard from '../components/FeedActivityCard.jsx';

// Render activities a page at a time and grow the window as the user scrolls near the
// end, instead of mounting the whole list (and every card's route map) up front.
const PAGE = 8;

export default function Activities({ vm, actions, getToken }) {
  const [tab, setTab] = useState('squad');
  const [visible, setVisible] = useState(PAGE);
  const token = getToken?.() ?? null;
  const list = tab === 'you' ? vm.myActivities : vm.activities;
  const tabs = [['squad', 'Squad'], ['you', 'You']];

  // Reset the window when switching tabs (each tab is its own list).
  useEffect(() => { setVisible(PAGE); }, [tab]);

  // Grow the window when the sentinel near the list end scrolls into view. rootMargin
  // prefetches the next page before the user actually hits the bottom.
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setVisible((v) => (v < list.length ? v + PAGE : v));
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list.length, tab]);

  const shown = list.slice(0, visible);
  const more = visible < list.length;

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* title lives in the global app header; keep the upload action */}
      <div style={s('display:flex;justify-content:flex-end')}>
        <div className="ctl" onClick={() => actions.go('upload')} style={s('display:flex;align-items:center;gap:6px;background:var(--accent);color:var(--accent-ink);font-size:12.5px;font-weight:700;padding:9px 13px;border-radius:11px;flex:none')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M6 10l6-6 6 6" /></svg>
          Upload
        </div>
      </div>

      {/* filter */}
      <div style={s('display:flex;gap:7px;margin-top:14px')}>
        {tabs.map(([id, lbl]) => (
          <div key={id} className="ctl" onClick={() => setTab(id)} style={s('padding:8px 16px;border-radius:11px;font-size:12.5px;font-weight:600;' + (tab === id ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg2);border:1px solid var(--line);color:var(--text2)'))}>{lbl}</div>
        ))}
      </div>

      {/* list — windowed; grows on scroll */}
      <div style={s('display:flex;flex-direction:column;gap:12px;margin-top:16px')}>
        {list.length === 0
          ? <EmptyState icon="🚴" title={tab === 'you' ? 'No activities yet' : 'No squad activity yet'} sub={tab === 'you' ? 'Record a ride or sync from Apple Health and it shows up here.' : 'When your teammates train, their activities appear here.'} />
          : shown.map((a) => <FeedActivityCard key={a.id} a={a} onOpen={actions.openActivity} onAthlete={actions.openAthlete} token={token} getToken={getToken} />)}
        {more && (
          <div ref={sentinelRef} style={s('display:flex;align-items:center;justify-content:center;padding:8px 0 4px')}>
            <div style={s('width:22px;height:22px;border-radius:50%;border:2.5px solid var(--line2);border-top-color:var(--accent);animation:spin .7s linear infinite')} />
          </div>
        )}
      </div>
    </div>
  );
}
