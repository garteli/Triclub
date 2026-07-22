import { useCallback, useEffect, useState } from 'react';
import { s, html } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import SquadEvents from '../components/SquadEvents.jsx';

const fmtRange = (a, b) => {
  const f = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  return a && b ? `${f(a)} – ${f(b)}` : '';
};

// A sheet listing the plans currently on the athlete's calendar, each removable (their copy only).
function MyPlansSheet({ planMine, onClose }) {
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!planMine?.list) { setItems([]); return; }
    setError('');
    try { const l = await planMine.list(); setItems(Array.isArray(l) ? l : []); }
    catch (e) { setError(e?.message || 'Could not load your plans.'); setItems([]); }
  }, [planMine]);
  useEffect(() => { load(); }, [load]);

  const remove = async (planId) => {
    setBusyId(planId); setError('');
    try {
      await planMine.remove(planId);
      setItems((xs) => (xs || []).filter((p) => p.planId !== planId));
      setConfirmId(null);
    } catch (e) { setError(e?.message || 'Could not remove the plan.'); }
    finally { setBusyId(null); }
  };

  const pending = confirmId ? (items || []).find((p) => p.planId === confirmId) : null;

  return (
    <>
      <div className="ctl" onClick={busyId ? undefined : onClose} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
      <div style={s('position:fixed;left:0;right:0;bottom:0;z-index:51;display:flex;justify-content:center;pointer-events:none')}>
        <div className="scr" style={s('width:100%;max-width:480px;pointer-events:auto;background:var(--bg);border-radius:24px 24px 0 0;border-top:1px solid var(--line2);max-height:85dvh;overflow-y:auto;padding:14px 18px 28px;animation:floatUp .3s ease')}>
          <div style={s('width:40px;height:4px;border-radius:3px;background:var(--line2);margin:0 auto 14px')} />
          <div style={s('display:flex;align-items:center;justify-content:space-between')}>
            <div style={s('font-size:18px;font-weight:700')}>Your plans</div>
            <div className="ctl" onClick={onClose} style={s('font-size:13px;color:var(--text2);font-weight:600')}>Close</div>
          </div>
          <div style={s('font-size:12px;color:var(--text3);margin-top:3px')}>Remove a plan to clear its sessions from your calendar.</div>

          {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-top:12px')}>{error}</div>}

          {items === null ? (
            <div style={s('text-align:center;font-size:12.5px;color:var(--text3);margin-top:20px')}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:20px;text-align:center;font-size:12.5px;color:var(--text3);margin-top:14px')}>You have no plans on your calendar.</div>
          ) : (
            <div style={s('display:flex;flex-direction:column;gap:10px;margin-top:14px')}>
              {items.map((p) => (
                <div key={p.planId} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px')}>
                  <div style={s('display:flex;align-items:center;gap:10px')}>
                    <div style={s('flex:1;min-width:0')}>
                      <div style={s('font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{p.name || 'Training plan'}</div>
                      <div style={s('font-size:11px;color:var(--text3);margin-top:2px')}>{fmtRange(p.firstDate, p.lastDate)} · {p.sessions} session{p.sessions === 1 ? '' : 's'}</div>
                    </div>
                    {confirmId !== p.planId && (
                      <div className={busyId === p.planId ? undefined : 'ctl'} onClick={busyId === p.planId ? undefined : () => setConfirmId(p.planId)}
                        style={s('width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,var(--bad) 12%,var(--bg3));border:1px solid color-mix(in srgb,var(--bad) 30%,transparent);color:var(--bad);flex:none;display:flex;align-items:center;justify-content:center')}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
                      </div>
                    )}
                  </div>
                  {confirmId === p.planId && (
                    <div style={s('display:flex;gap:8px;margin-top:11px')}>
                      <div className="ctl" onClick={busyId ? undefined : () => setConfirmId(null)} style={s('flex:1;text-align:center;padding:10px;border-radius:11px;font-weight:700;font-size:13px;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>Keep</div>
                      <div className="ctl" onClick={busyId ? undefined : () => remove(p.planId)} style={s(`flex:1;text-align:center;padding:10px;border-radius:11px;font-weight:700;font-size:13px;background:var(--bad);color:#fff;opacity:${busyId === p.planId ? 0.7 : 1}`)}>{busyId === p.planId ? 'Removing…' : 'Remove for me'}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const seg = (active) =>
  active
    ? 'flex:1;text-align:center;padding:7px 6px;border-radius:9px;font-size:11.5px;font-weight:600;background:var(--accent,#d6ff3f);color:#141a05'
    : 'flex:1;text-align:center;padding:7px 6px;border-radius:9px;font-size:11.5px;font-weight:600;background:rgba(255,255,255,.06);color:#c8ccd2';

function WorkoutSheet({ wkDetail, actions, live }) {
  const course = wkDetail.course;
  // Start the ride, pre-selecting the coach's route if one is attached (it draws on the live map).
  const startNow = () => {
    if (course?.points?.length) live?.courses?.setCourse?.(course);
    actions.go('ride');
  };
  return (
    <>
      <div className="ctl" onClick={actions.closeWorkout} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
      {/* Viewport-anchored (fixed): absolute pins to Phone's content-height scroll
          wrapper, so on a short page the sheet floats mid-screen with dead space below
          (see PlanEditor's sheet for the same fix). The wrapper is click-through so taps
          outside the sheet hit the overlay; the sheet re-enables its own pointer events. */}
      <div style={s('position:fixed;left:0;right:0;bottom:0;z-index:51;display:flex;justify-content:center;pointer-events:none')}>
      <div className="scr" style={s('width:100%;max-width:480px;pointer-events:auto;background:var(--bg);border-radius:26px 26px 0 0;border-top:1px solid var(--line2);max-height:90dvh;overflow-y:auto;animation:floatUp .3s ease;padding:14px 18px 32px')}>
        <div style={s('width:40px;height:4px;border-radius:3px;background:var(--line2);margin:0 auto 16px')} />
        <div style={s(`height:4px;background:${wkDetail.color};border-radius:3px;margin-bottom:14px;width:52px`)} />
        <div style={s('font-size:22px;font-weight:700;letter-spacing:-.4px')}>{wkDetail.title}</div>
        <div style={s('font-size:13px;color:var(--text2);margin-top:2px')}>{wkDetail.meta}</div>
        <div style={s('display:flex;gap:0;margin-top:16px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px')}>
          {wkDetail.stats.map((st, i) => (
            <div key={i} style={s('flex:1;text-align:center;border-left:1px solid var(--line)')}><div className="mono" style={s('font-size:18px;font-weight:700')}>{st.v}</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase')}>{st.l}</div></div>
          ))}
        </div>
        <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600;margin:20px 0 10px')}>Structure</div>
        <div style={s('display:flex;flex-direction:column;gap:7px')}>
          {wkDetail.blocks.map((b, i) => (
            <div key={i} style={s('display:flex;align-items:center;gap:11px;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:11px 13px')}>
              <div style={s(`width:44px;height:${b.h};border-radius:6px;background:${b.barBg};flex:none`)} />
              <div style={s('flex:1')}><div style={s('font-size:13px;font-weight:600')}>{b.name}</div><div style={s('font-size:11px;color:var(--text2)')}>{b.detail}</div></div>
              <span className="mono" style={s(`font-size:11px;color:${wkDetail.color};font-weight:700`)}>{b.tag}</span>
            </div>
          ))}
        </div>
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px;margin-top:16px;display:flex;gap:10px;align-items:flex-start')}>
          <div style={s('width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#37c0ff,#5a86ff);flex:none;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff')}>C</div>
          <div style={s('font-size:12.5px;color:var(--text2);line-height:1.5')}><span style={s('color:var(--text);font-weight:600')}>Coach:</span> {wkDetail.note}</div>
        </div>
        {course && (
          <div style={s('display:flex;align-items:center;gap:10px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px;margin-top:14px')}>
            <div style={s('width:30px;height:30px;border-radius:9px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent);flex:none;display:flex;align-items:center;justify-content:center')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            </div>
            <div style={s('flex:1;min-width:0')}>
              <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-weight:600')}>Route to follow</div>
              <div style={s('font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{course.name}</div>
            </div>
            <div style={s('font-size:11px;color:var(--text3);flex:none')}>{course.points.length} pts</div>
          </div>
        )}
        <div style={s('display:flex;gap:9px;margin-top:16px')}>
          <div className="ctl" onClick={startNow} style={s('flex:1;background:var(--accent);color:var(--accent-ink);text-align:center;padding:14px;border-radius:13px;font-weight:700;font-size:14px')}>Start now</div>
          <div className="ctl" onClick={actions.closeWorkout} style={s('width:56px;background:var(--bg3);border:1px solid var(--line);border-radius:13px;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:13px;font-weight:600')}>Close</div>
        </div>
      </div>
      </div>
    </>
  );
}

const dowLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const legend = [['Bike', 'var(--bike)'], ['Swim', 'var(--swim)'], ['Run', 'var(--run)'], ['Gym', 'var(--gym)']];

export default function Plan({ vm, state, actions, planMine, live, meId, getToken }) {
  const week = state.planView === 'week';
  const [showMine, setShowMine] = useState(false);
  // Coach mode is only for the coach of the active club — i.e. its owner (the app gates every
  // coach action on owner == caller). Hide the Coach toggle otherwise.
  const owner = vm.activeSquad?.owner;
  const isClubCoach = !!meId && !!owner && String(owner).toLowerCase() === String(meId).toLowerCase();
  // Motorsport clubs run on scheduled group rides, not a structured training plan — so the
  // plan-management buttons (My plans, Coach mode) are hidden for them.
  const isMotor = vm.family === 'motorsport';
  // Leave any stale coach view when the active club is one this athlete doesn't coach, or a
  // motorsport club (no plans there).
  useEffect(() => { if ((!isClubCoach || isMotor) && state.coachView) actions.toggleCoach(); }, [isClubCoach, isMotor, state.coachView, actions]);
  const coachToggleStyle = state.coachView
    ? 'background:var(--accent);color:var(--accent-ink)'
    : 'background:var(--bg3);color:var(--text2);border:1px solid var(--line)';

  return (
    <>
      <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
        <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:14px')}>
          <div><div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>{week ? vm.planNav.weekEyebrow : 'Month'}</div><div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px')}>Training Plan</div></div>
          <div style={s('display:flex;gap:7px')}>
            {isClubCoach && (
              <div className="ctl" onClick={() => actions.editEvent(null)} style={s('background:var(--accent);color:var(--accent-ink);border-radius:11px;padding:8px 11px;font-size:11.5px;font-weight:700;display:flex;align-items:center;gap:6px')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Event
              </div>
            )}
            {planMine && !isMotor && (
              <div className="ctl" onClick={() => setShowMine(true)} style={s('background:var(--bg3);color:var(--text2);border:1px solid var(--line);border-radius:11px;padding:8px 11px;font-size:11.5px;font-weight:700;display:flex;align-items:center;gap:6px')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>My plans
              </div>
            )}
            {isClubCoach && !isMotor && (
              <div className="ctl" onClick={actions.toggleCoach} style={s(`${coachToggleStyle};border-radius:11px;padding:8px 11px;font-size:11.5px;font-weight:700;display:flex;align-items:center;gap:6px`)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>Coach
              </div>
            )}
          </div>
        </div>

        {state.coachView && !isMotor && (
          <div className="ctl" onClick={() => actions.go('plans')} style={s('background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:14px;padding:11px 13px;margin-bottom:14px;display:flex;gap:9px;align-items:center')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><path d="M12 2a10 10 0 1 0 10 10" /><path d="M22 4L12 14l-3-3" /></svg>
            <div style={s('flex:1;font-size:12px;color:var(--text2);line-height:1.4')}><span style={s('color:var(--text);font-weight:600')}>Coach mode.</span> Manage your training plans and publish them to the squad.</div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
          </div>
        )}

        <div style={s('display:flex;gap:6px;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:4px;margin-bottom:10px')}>
          <div className="ctl" onClick={() => actions.setPlanView('week')} style={s(seg(week))}>Week</div>
          <div className="ctl" onClick={() => actions.setPlanView('month')} style={s(seg(!week))}>Month</div>
        </div>

        <div style={s('display:flex;align-items:center;gap:8px;margin-bottom:16px')}>
          <div className="ctl" onClick={() => actions.planStep(-1)} style={s('width:38px;height:36px;flex:none;border-radius:11px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text2)')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </div>
          <div style={s('flex:1;min-width:0;text-align:center')}>
            <div style={s('font-size:14.5px;font-weight:700;letter-spacing:-.2px')}>{week ? vm.planNav.weekLabel : vm.planNav.monthLabel}</div>
            {!vm.planNav.isCurrent && (
              <div className="ctl" onClick={actions.planToday} style={s('font-size:10.5px;color:var(--accent);font-weight:700;margin-top:1px')}>Jump to today</div>
            )}
          </div>
          <div className="ctl" onClick={() => actions.planStep(1)} style={s('width:38px;height:36px;flex:none;border-radius:11px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text2)')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </div>
        </div>

        {week ? (
          <>
            {(() => { const sm = vm.planSummary || { planned: '0:00', load: '0', done: 0, total: 0 }; return (
            <div style={s('display:flex;justify-content:space-between;margin-bottom:14px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 8px')}>
              <div style={s('flex:1;text-align:center;border-right:1px solid var(--line)')}><div className="mono" style={s('font-size:18px;font-weight:700')}>{sm.planned}</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Planned</div></div>
              <div style={s('flex:1;text-align:center;border-right:1px solid var(--line)')}><div className="mono" style={s('font-size:18px;font-weight:700;color:var(--accent)')}>{sm.load}</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Load</div></div>
              <div style={s('flex:1;text-align:center')}><div className="mono" style={s('font-size:18px;font-weight:700')}>{sm.done}<span style={s('font-size:11px;color:var(--text2)')}>/{sm.total}</span></div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Done</div></div>
            </div>
            ); })()}
            {vm.plan.length === 0 && (
              <EmptyState icon="📅" title="No sessions planned" sub="Your coach's weekly plan will appear here once it's set." />
            )}
            <div style={s('display:flex;flex-direction:column;gap:9px')}>
              {vm.plan.map((p) => (
                <div key={p.day} className="ctl" onClick={() => actions.openWorkout(p)} style={s(`background:var(--bg2);border:1px solid ${p.rowBorder};border-radius:16px;padding:12px 13px;display:flex;gap:12px;align-items:center`)}>
                  <div style={s('flex:none;width:38px;text-align:center')}><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-weight:600')}>{p.day}</div><div className="mono" style={s('font-size:17px;font-weight:700')}>{p.date}</div></div>
                  <div style={s('width:1px;height:34px;background:var(--line)')} />
                  <div style={s(`width:36px;height:36px;border-radius:11px;background:color-mix(in srgb,${p.color} 16%,transparent);color:${p.color};flex:none;display:flex;align-items:center;justify-content:center`)} dangerouslySetInnerHTML={html(p.iconHtml)} />
                  <div style={s('flex:1;min-width:0')}><div style={s('font-size:14px;font-weight:600')}>{p.title}</div><div style={s('font-size:11.5px;color:var(--text2)')}>{p.sub}</div></div>
                  <div style={s('text-align:right;flex:none')}><span style={s(`font-size:9.5px;font-weight:700;padding:3px 7px;border-radius:6px;color:${p.badgeC};background:${p.badgeBg}`)}>{p.badgeT}</span><div className="mono" style={s('font-size:11px;color:var(--text3);margin-top:5px')}>{p.dur} · {p.load}</div></div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={s('display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:8px')}>
              {dowLabels.map((d, i) => <div key={i} style={s('text-align:center;font-size:10px;color:var(--text3);font-weight:600')}>{d}</div>)}
            </div>
            <div style={s('display:grid;grid-template-columns:repeat(7,1fr);gap:5px')}>
              {vm.monthCells.map((c, i) => (
                <div key={i} style={s(`${c.cellStyle};aspect-ratio:1;border-radius:9px;padding:5px 4px;display:flex;flex-direction:column;justify-content:space-between`)}>
                  <div className="mono" style={s(`font-size:11px;font-weight:600;opacity:${c.dayOpacity}`)}>{c.day}</div>
                  <div style={s('display:flex;gap:2px;justify-content:center')}>{c.disc && <div style={s(`width:5px;height:5px;border-radius:50%;background:${c.dotColor};opacity:${c.dotOpacity}`)} />}</div>
                </div>
              ))}
            </div>
            <div style={s('display:flex;gap:14px;margin-top:16px;justify-content:center')}>
              {legend.map(([lbl, col]) => (
                <div key={lbl} style={s('display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)')}><span style={s(`width:8px;height:8px;border-radius:50%;background:${col}`)} />{lbl}</div>
              ))}
            </div>
          </>
        )}

        {/* club group sessions the coach scheduled — members join here and check in on the day
            from the Live page. Collapses when there's nothing upcoming. */}
        {vm.activeClubId && (
          <div style={s('margin-top:20px')}>
            <SquadEvents squadId={vm.activeClubId} getToken={getToken} mode="browse" disc={vm.activeSquad?.disc} onOpen={(ev) => actions.openEvent(ev)} />
          </div>
        )}
      </div>

      {state.showWorkout && <WorkoutSheet wkDetail={vm.wkDetail} actions={actions} live={live} />}
      {showMine && planMine && <MyPlansSheet planMine={planMine} onClose={() => setShowMine(false)} />}
    </>
  );
}
