import { useState } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import FeedActivityCard from '../components/FeedActivityCard.jsx';

export default function Activities({ vm, actions, getToken }) {
  const [tab, setTab] = useState('squad');
  const token = getToken?.() ?? null;
  const list = tab === 'you' ? vm.myActivities : vm.activities;
  const tabs = [['squad', 'Squad'], ['you', 'You']];
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <div style={s('display:flex;align-items:flex-end;justify-content:space-between;gap:10px')}>
        <div><div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Feed</div><div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px')}>Activities</div></div>
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

      {/* list */}
      <div style={s('display:flex;flex-direction:column;gap:12px;margin-top:16px')}>
        {list.length === 0
          ? <EmptyState icon="🚴" title={tab === 'you' ? 'No activities yet' : 'No squad activity yet'} sub={tab === 'you' ? 'Record a ride or sync from Apple Health and it shows up here.' : 'When your teammates train, their activities appear here.'} />
          : list.map((a) => <FeedActivityCard key={a.id} a={a} onOpen={actions.openActivity} onAthlete={actions.openAthlete} token={token} getToken={getToken} />)}
      </div>
    </div>
  );
}
