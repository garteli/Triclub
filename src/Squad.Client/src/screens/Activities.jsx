import { useState } from 'react';
import { s } from '../lib/style.js';
import TileMap from '../components/TileMap.jsx';
import { toPathD } from '../lib/tiles.js';
import EmptyState from '../components/EmptyState.jsx';

const MiniMap = ({ a }) => (
  <div style={s('margin-top:11px;border-radius:14px;overflow:hidden;border:1px solid var(--line)')}>
    <TileMap points={a.routePath} W={356} H={120} radius={14} pad={16}>
      {(project) => {
        const d = toPathD(a.routePath, project);
        const start = project(a.routePath[0][0], a.routePath[0][1]);
        return (
          <>
            <path d={d} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke={a.sportColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={start.x} cy={start.y} r="5" fill="var(--good)" stroke="#fff" strokeWidth="2" />
          </>
        );
      }}
    </TileMap>
  </div>
);

function Card({ a, onOpen, onAthlete }) {
  const stats = a.sport === 'Gym'
    ? [[a.moving, 'Time'], [String(a.load), 'Load'], [String(a.avgHr), 'Avg HR']]
    : [[a.dist + (a.distU ? ' ' + a.distU : ''), 'Distance'], [a.moving, 'Moving'], [String(a.load), 'Load']];
  return (
    <div className="ctl" onClick={() => onOpen(a.id)} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:18px;padding:14px')}>
      {/* athlete row */}
      <div style={s('display:flex;align-items:center;gap:11px')}>
        <div className="ctl" onClick={(e) => { e.stopPropagation(); onAthlete(a.athleteId); }} style={s(`width:40px;height:40px;border-radius:12px;background:${a.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#0c0e11`)}>{a.initials}</div>
        <div style={s('flex:1;min-width:0')}>
          <div style={s('font-size:13.5px;font-weight:700')}>{a.athleteName}</div>
          <div style={s('font-size:11px;color:var(--text3)')}>{a.when} · {a.location}</div>
        </div>
        <div style={s(`background:color-mix(in srgb,${a.sportColor} 16%,transparent);color:${a.sportColor};font-size:10px;font-weight:700;padding:4px 9px;border-radius:7px;text-transform:uppercase`)}>{a.sport}</div>
      </div>

      <div style={s('font-size:15px;font-weight:700;margin-top:10px')}>{a.title}</div>

      {a.hasMap && a.routePath && <MiniMap a={a} />}

      {/* stats */}
      <div style={s('display:flex;margin-top:12px')}>
        {stats.map(([v, l], i) => (
          <div key={l} style={s('flex:1' + (i > 0 ? ';border-left:1px solid var(--line);padding-left:12px' : ''))}>
            <div className="mono" style={s('font-size:16px;font-weight:700')}>{v}</div>
            <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px')}>{l}</div>
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={s('display:flex;align-items:center;gap:10px;margin-top:12px;padding-top:11px;border-top:1px solid var(--line)')}>
        <span style={s('font-size:12px;color:var(--text2);flex:1')}>{a.reactText}</span>
        {a.achievements > 0 && <span style={s('font-size:10px;font-weight:700;color:var(--bike);background:color-mix(in srgb,var(--bike) 15%,transparent);padding:3px 8px;border-radius:6px')}>🏆 {a.achievements}</span>}
        {a.comments > 0 && <span style={s('font-size:11px;color:var(--text3)')}>💬 {a.comments}</span>}
      </div>
    </div>
  );
}

export default function Activities({ vm, actions }) {
  const [tab, setTab] = useState('squad');
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
          : list.map((a) => <Card key={a.id} a={a} onOpen={actions.openActivity} onAthlete={actions.openAthlete} />)}
      </div>
    </div>
  );
}
