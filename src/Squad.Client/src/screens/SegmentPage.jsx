import { useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import AuthedAvatar from '../components/AuthedAvatar.jsx';
import { fmtDur } from '../hooks/useActivityAnalytics.js';
import { segmentBoard } from '../lib/segments.js';

const SPORT_BYTE = { Swim: 1, Bike: 2, Ride: 2, Run: 3 };
const SCOPES = [{ k: 'squad', label: 'Squad', of: 'of squad' }, { k: 'all', label: 'All-Time', of: 'all-time' }, { k: 'year', label: 'This Year', of: 'this year' }];

const effDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }); };
const isToday = (iso) => { const d = new Date(iso); const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };
const ordinal = (n) => { const t = n % 100; if (t >= 11 && t <= 13) return `${n}th`; return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`; };

const GREEN = '#4fd23a', AMBER = '#f5a623', RED = '#ff5b6e', GOLD = '#ffc24d';

// One route section of an activity ("segment"): the athlete's real recorded effort over that exact
// stretch (time / speed / power / HR from the frames in its distance band), their PR + rank + effort
// count, and a real cross-athlete leaderboard matched from stored GPS tracks. Reached by tapping a
// section in the activity's Route & timing breakdown. Everything is real — no fabricated numbers.

const kindLabel = (seg) =>
  seg.kind === 'climb' ? (seg.cat ? `Cat ${seg.cat} climb` : 'Climb')
    : seg.kind === 'descent' ? 'Descent'
      : Math.abs(seg.avgGradPct) < 1 ? 'Flat' : 'Rolling';

export default function SegmentPage({ state, actions, getToken }) {
  const seg = state.selSegment;
  const [scope, setScope] = useState('squad');
  const [board, setBoard] = useState({ status: 'loading', efforts: [], yourEffortCount: 0 });
  const token = getToken?.() ?? null;
  const canRun = !!seg && Array.isArray(seg.path) && seg.path.length >= 2 && seg.lenM > 0;

  // Real segment board: matches this stretch against stored GPS tracks server-side, one fastest
  // effort per rider + a raw count of the viewer's own matches (YourEffortCount).
  useEffect(() => {
    if (!canRun) { setBoard({ status: 'idle', efforts: [], yourEffortCount: 0 }); return undefined; }
    let ok = true;
    setBoard((p) => ({ ...p, status: 'loading' }));
    (async () => {
      try {
        const t = await getToken?.();
        const body = { scope, sport: SPORT_BYTE[seg.sport] || 2, lengthM: seg.lenM, path: seg.path };
        const res = await segmentBoard(t, body);
        if (ok) setBoard({ status: 'ready', efforts: res?.efforts || [], yourEffortCount: res?.yourEffortCount || 0 });
      } catch { if (ok) setBoard({ status: 'error', efforts: [], yourEffortCount: 0 }); }
    })();
    return () => { ok = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, seg?.index, seg?.lenM]);

  if (!seg) {
    return <div style={s('padding:20px 18px 120px')}><EmptyState icon="⛰️" title="No segment" sub="Open a ride and tap a route section to see it here." /></div>;
  }

  const eff = seg.effort || {};
  const lenKm = (seg.lenM / 1000).toFixed(2);
  const gainTxt = `${seg.gainM >= 0 ? '↑' : '↓'}${Math.abs(seg.gainM)} m`;
  const accent = seg.color || 'var(--accent)';

  const { status, efforts, yourEffortCount } = board;
  const me = efforts.find((e) => e.isMe) || null;
  const myRank = me ? efforts.indexOf(me) + 1 : null;
  const leader = efforts[0] || null;
  const gap = leader && me && me.timeSec > leader.timeSec ? me.timeSec - leader.timeSec : 0;
  const scopeMeta = SCOPES.find((sc) => sc.k === scope);

  const whenIso = seg.activityWhenUtc;
  const whenLabel = whenIso ? (isToday(whenIso) ? 'Today' : effDate(whenIso)) : null;

  // The four headline numbers for this activity's effort over the stretch (real recorded values).
  const bigs = [
    eff.durationSec != null && { v: fmtDur(eff.durationSec), u: '', k: 'Time', c: 'var(--text)' },
    eff.avgSpeed != null && { v: eff.avgSpeed.toFixed(1), u: 'km/h', k: 'km/h', c: GREEN },
    eff.avgPower != null && { v: String(eff.avgPower), u: '', k: 'Avg W', c: AMBER },
    eff.avgHr != null && { v: String(eff.avgHr), u: '', k: 'BPM', c: RED },
  ].filter(Boolean);

  return (
    <div style={s('padding:4px 16px 120px;animation:floatUp .35s ease')}>
      {/* name + kind */}
      <div style={s('display:flex;align-items:center;gap:11px')}>
        <span style={s(`width:40px;height:40px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,${accent} 16%,transparent)`)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20l6-14 5 9 3-5 4 10z" /></svg>
        </span>
        <div style={s('flex:1;min-width:0')}>
          <div dir="auto" style={s('font-size:18px;font-weight:700;letter-spacing:-.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left')}>{seg.name}</div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-top:3px')}>{kindLabel(seg)} · {lenKm} km · {gainTxt}</div>
        </div>
      </div>

      {/* your effort */}
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:18px;padding:15px 16px 16px;margin-top:14px')}>
        <div style={s('display:flex;align-items:center;gap:8px')}>
          <span style={s('font-size:10px;color:var(--accent);text-transform:uppercase;letter-spacing:1.2px;font-weight:700')}>Your effort{whenLabel ? ` · ${whenLabel}` : ''}</span>
          {status === 'ready' && myRank && (
            <span style={s(`margin-left:auto;display:inline-flex;align-items:center;gap:5px;background:color-mix(in srgb,${GOLD} 15%,transparent);color:${GOLD};font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px`)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4L11 3.8a2 2 0 0 0-1.4-.6H4v5.6a2 2 0 0 0 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l3.6-3.6a2 2 0 0 0 0-2.8z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" /></svg>
              {ordinal(myRank)} {scopeMeta.of}
            </span>
          )}
        </div>

        {bigs.length > 0 ? (
          <div style={s('display:flex;flex-wrap:wrap;gap:20px 22px;margin-top:13px')}>
            {bigs.map((b) => (
              <div key={b.k}>
                <div className="mono" style={s(`font-size:28px;font-weight:800;letter-spacing:-1px;line-height:1;color:${b.c}`)}>{b.v}</div>
                <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;margin-top:7px')}>{b.k}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={s('font-size:12.5px;color:var(--text3);margin-top:10px')}>No power / speed data was recorded over this section.</div>
        )}

        {/* PR + your efforts count (real, from the board) */}
        {(me || status === 'loading') && (
          <div style={s('display:flex;gap:10px;margin-top:15px')}>
            <div style={s('flex:1;background:var(--bg3);border:1px solid var(--line);border-radius:13px;padding:11px 13px;display:flex;align-items:center;gap:9px')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill={GOLD} style={s('flex:none')}><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg>
              <div>
                <div className="mono" style={s('font-size:15px;font-weight:800;line-height:1')}>{me ? fmtDur(me.timeSec) : '…'}</div>
                <div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-top:4px')}>Your PR</div>
              </div>
            </div>
            <div style={s('flex:1;background:var(--bg3);border:1px solid var(--line);border-radius:13px;padding:11px 13px;display:flex;align-items:center;gap:9px')}>
              <div>
                <div className="mono" style={s('font-size:15px;font-weight:800;line-height:1')}>{status === 'ready' ? yourEffortCount : '…'}</div>
                <div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-top:4px')}>Your efforts</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* leaderboard — real efforts matched from stored GPS tracks (squad / all-time / this year) */}
      <Leaderboard scope={scope} setScope={setScope} status={status} efforts={efforts} leader={leader} me={me} gap={gap} token={token} />

      <div className="ctl" onClick={() => actions.back?.()} style={s('text-align:center;margin-top:18px;font-size:12.5px;font-weight:700;color:var(--accent)')}>Back to the ride</div>
    </div>
  );
}

// Presentational leaderboard: scope tabs, gold leader banner, ranked list (viewer highlighted),
// and the gap to the crown. Data is fetched by the parent so the effort card shares it.
function Leaderboard({ scope, setScope, status, efforts, leader, me, gap, token }) {
  return (
    <>
      <div style={s('display:flex;align-items:center;gap:10px;margin:24px 2px 12px')}>
        <span style={s('font-size:10px;color:var(--accent);text-transform:uppercase;letter-spacing:1.3px;font-weight:700')}>Leaderboard</span>
        <span style={s('flex:1;height:1px;background:var(--line)')} />
      </div>

      <div style={s('display:flex;gap:7px;margin-bottom:14px')}>
        {SCOPES.map((sc) => (
          <div key={sc.k} className="ctl" onClick={() => setScope(sc.k)}
            style={s(`flex:1;text-align:center;padding:10px 4px;border-radius:11px;font-size:13px;font-weight:700;${scope === sc.k
              ? 'background:color-mix(in srgb,var(--accent) 14%,transparent);border:1px solid color-mix(in srgb,var(--accent) 50%,transparent);color:var(--accent)'
              : 'background:var(--bg2);border:1px solid var(--line);color:var(--text2)'}`)}>{sc.label}</div>
        ))}
      </div>

      {status === 'loading' ? (
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:22px;text-align:center;color:var(--text3);font-size:12.5px')}>Matching riders on this stretch…</div>
      ) : status === 'error' ? (
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:18px;text-align:center;color:var(--text3);font-size:12.5px')}>Couldn't load the leaderboard. Try again.</div>
      ) : efforts.length === 0 ? (
        <div style={s('background:var(--bg2);border:1px dashed var(--line2);border-radius:16px;padding:18px 16px;text-align:center')}>
          <div style={s('font-size:13.5px;font-weight:700')}>No matched efforts yet</div>
          <div style={s('font-size:12px;color:var(--text2);margin-top:4px;line-height:1.5')}>{scope === 'squad' ? 'No one in your squad has a recorded ride over this exact stretch yet.' : 'No recorded rides match this stretch yet — you may be the first.'}</div>
        </div>
      ) : (
        <>
          {/* leader / KOM banner */}
          <div style={s(`display:flex;align-items:center;gap:13px;background:color-mix(in srgb,${GOLD} 10%,var(--bg2));border:1px solid color-mix(in srgb,${GOLD} 30%,transparent);border-radius:16px;padding:13px 15px`)}>
            <div style={s('position:relative;flex:none')}>
              <AuthedAvatar avatarUrl={leader.avatarUrl} token={token} initials={leader.initials} color={leader.avatarColor} size={44} radius={12} fontSize={16} />
              <svg width="20" height="20" viewBox="0 0 24 24" fill={GOLD} style={s('position:absolute;top:-9px;left:50%;transform:translateX(-50%)')}><path d="M3 7l4 4 5-7 5 7 4-4v10H3z" /></svg>
            </div>
            <div style={s('flex:1;min-width:0')}>
              <div style={s(`font-size:9px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;color:${GOLD}`)}>{scope === 'squad' ? 'Squad leader · fastest' : 'Course record'}</div>
              <div style={s('font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px')}>{leader.name}</div>
            </div>
            <div className="mono" style={s('text-align:right;flex:none')}>
              <div style={s(`font-size:20px;font-weight:800;color:${GOLD};line-height:1`)}>{fmtDur(leader.timeSec)}</div>
              <div style={s('font-size:10px;color:var(--text2);margin-top:4px')}>{leader.avgSpeedKph.toFixed(1)} km/h</div>
            </div>
          </div>

          {/* ranked list */}
          <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:5px 6px;margin-top:12px')}>
            {efforts.map((e, i) => (
              <div key={e.athleteId} style={s(`display:flex;align-items:center;gap:11px;padding:10px;border-radius:12px;margin:2px 0;${e.isMe ? 'background:color-mix(in srgb,var(--bike) 12%,transparent)' : i === 0 ? `background:color-mix(in srgb,${GOLD} 8%,transparent)` : ''}`)}>
                <span className="mono" style={s(`font-size:14px;font-weight:800;width:24px;text-align:center;color:${i === 0 ? GOLD : e.isMe ? 'var(--bike)' : 'var(--text3)'}`)}>{i + 1}</span>
                <AuthedAvatar avatarUrl={e.avatarUrl} token={token} initials={e.initials} color={e.avatarColor} size={32} radius={999} fontSize={12}
                  style={i === 0 ? `border:2px solid ${GOLD}` : e.isMe ? 'border:2px solid var(--bike)' : ''} />
                <div style={s('flex:1;min-width:0')}>
                  <div style={s('font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{e.name}</div>
                  <div className="mono" style={s('font-size:10px;color:var(--text3);margin-top:2px')}>{isToday(e.whenUtc) ? 'Today' : effDate(e.whenUtc)}</div>
                </div>
                <div className="mono" style={s('text-align:right')}>
                  <div style={s(`font-size:14px;font-weight:700;${e.isMe ? 'color:var(--bike)' : ''}`)}>{fmtDur(e.timeSec)}</div>
                  <div style={s('font-size:9.5px;color:var(--text3);margin-top:2px')}>{e.avgSpeedKph.toFixed(1)} km/h</div>
                </div>
              </div>
            ))}
          </div>

          {gap > 0 && (
            <div style={s('display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px;padding:12px;border-radius:12px;background:color-mix(in srgb,var(--accent) 8%,transparent);font-size:13px;font-weight:600;color:var(--accent)')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              Take {fmtDur(gap)} off to earn the crown
            </div>
          )}
        </>
      )}
    </>
  );
}
