import { useState } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import { deleteActivity } from '../hooks/useActivities.js';

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';

// Data-driven single-activity detail (yours or a teammate's). Header + summary
// metrics come from vm.activityDetail (real). Deep per-point analysis (route,
// HR/power traces, splits, laps) needs the ingested recording stream, which
// isn't wired yet — so we show only real summary data + an honest placeholder.
export default function Feed({ vm, state, actions, getToken, onDataChanged }) {
  const a = vm.activityDetail;
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    if (!a || deleting) return;
    setDeleting(true);
    try {
      const token = getToken ? await getToken() : null;
      await deleteActivity(a.id, token);
      onDataChanged?.();
      actions.go(state.activityBack || 'activities');
    } catch {
      setDeleting(false); // stay on the sheet; the row wasn't removed
    }
  };

  if (!a) {
    return (
      <div style={s('padding:6px 0 120px;animation:floatUp .35s ease')}>
        <div style={s('display:flex;align-items:center;gap:11px;padding:2px 18px 12px')}>
          <div className="ctl" onClick={() => actions.go(state.activityBack || 'activities')} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
          </div>
        </div>
        <EmptyState icon="🚴" title="Activity not found" sub="This activity isn't available. Record a ride or sync from Apple Health to see it here." />
      </div>
    );
  }
  return (
    <div style={s('padding:6px 0 120px;animation:floatUp .35s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:center;gap:11px;padding:2px 18px 12px')}>
        <div className="ctl" onClick={() => actions.go(state.activityBack || 'activities')} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
        </div>
        <div className="ctl" onClick={() => actions.openAthlete(a.athleteId)} style={s(`width:40px;height:40px;border-radius:12px;background:${a.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#0c0e11`)}>{a.initials}</div>
        <div style={s('flex:1;min-width:0')}><div style={s('font-size:15px;font-weight:700')}>{a.title}</div><div style={s('font-size:12px;color:var(--text2)')}>{a.athleteName} · {a.when} · {a.location}</div></div>
        <div style={s(`background:color-mix(in srgb,${a.sportColor} 16%,transparent);color:${a.sportColor};font-size:10px;font-weight:700;padding:4px 9px;border-radius:7px;text-transform:uppercase`)}>{a.sport}</div>
        {a.isMe && (
          <div className="ctl" onClick={() => setConfirmDel(true)} title="Delete training" style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none;color:var(--bad)')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
          </div>
        )}
      </div>

      {/* key metrics (real activity summary) */}
      <div style={s('display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:14px 18px 0')}>
        {a.metricCards.map(([v, u, l, col], i) => (
          <div key={i} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:11px 12px')}>
            <div className="mono" style={s(`font-size:20px;font-weight:700${col ? ';color:' + col : ''}`)}>{v}{u && <span style={s('font-size:11px;color:var(--text2)')}>{u}</span>}</div>
            <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px')}>{l}</div>
          </div>
        ))}
      </div>

      {/* detailed analysis needs the full recording stream (not ingested yet) */}
      <div style={s('padding:20px 18px 0')}>
        <div style={s('background:var(--bg2);border:1px dashed var(--line2);border-radius:16px;padding:18px;text-align:center')}>
          <div style={s('font-size:13px;font-weight:600')}>Detailed analysis coming</div>
          <div style={s('font-size:12px;color:var(--text3);line-height:1.5;margin-top:4px')}>Route map, heart-rate &amp; power traces, splits and laps appear here once the full recording is synced from your device or a FIT file.</div>
        </div>
      </div>

      {/* reactions */}
      <div style={s('padding:20px 18px 0')}>
        <div style={s('display:flex;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 14px')}>
          <span style={s('font-size:12px;color:var(--text2);flex:1')}>{a.reactText}</span>
          <div className="ctl" style={s('font-size:12px;font-weight:600;color:var(--accent)')}>React</div>
        </div>
      </div>

      {/* more feed */}
      <div style={s(label + ';margin:24px 18px 12px')}>More from your squad</div>
      <div style={s('display:flex;flex-direction:column;gap:10px;padding:0 18px')}>
        {vm.feed.map((f) => (
          <div key={f.id} className="ctl" onClick={() => (f.activityId ? actions.openActivity(f.activityId) : actions.openAthlete(f.athleteId))} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;gap:12px;align-items:center')}>
            <div style={s(`width:40px;height:40px;border-radius:12px;background:${f.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#0c0e11`)}>{f.initials}</div>
            <div style={s('flex:1;min-width:0')}><div style={s('font-size:13px;line-height:1.3')}><span style={s('font-weight:600')}>{f.name}</span> <span style={s('color:var(--text2)')}>{f.action}</span></div><div style={s('display:flex;gap:10px;margin-top:4px;align-items:center')}><span className="mono" style={s('font-size:11px')}>{f.metric}</span><span style={s('font-size:11px;color:var(--text3)')}>{f.time}</span></div></div>
            <div style={s(`width:30px;height:30px;border-radius:8px;background:color-mix(in srgb,${f.discColor} 16%,transparent);flex:none;display:flex;align-items:center;justify-content:center;font-size:14px`)}>{f.icon}</div>
          </div>
        ))}
      </div>

      {/* delete confirmation — themed (CSS vars), consistent in dark & light */}
      {confirmDel && (
        <>
          <div className="ctl" onClick={() => !deleting && setConfirmDel(false)} style={s('position:absolute;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
          <div className="scr" style={s('position:absolute;left:18px;right:18px;top:50%;transform:translateY(-50%);z-index:51;background:var(--bg);border:1px solid var(--line2);border-radius:20px;padding:20px;animation:floatUp .25s ease')}>
            <div style={s('font-size:17px;font-weight:700')}>Delete this training?</div>
            <div style={s('font-size:13px;color:var(--text2);line-height:1.5;margin-top:8px')}>{a.title} · {a.when}. This removes it from your activities, feed and leaderboard. You can re-import it later.</div>
            <div style={s('display:flex;gap:10px;margin-top:18px')}>
              <div className="ctl" onClick={() => !deleting && setConfirmDel(false)} style={s('flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>Cancel</div>
              <div className="ctl" onClick={doDelete} style={s(`flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bad);color:#fff;opacity:${deleting ? 0.7 : 1}`)}>{deleting ? 'Deleting…' : 'Delete'}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
