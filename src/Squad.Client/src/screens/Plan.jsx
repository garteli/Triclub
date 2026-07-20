import { s, html } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';

const seg = (active) =>
  active
    ? 'flex:1;text-align:center;padding:7px 6px;border-radius:9px;font-size:11.5px;font-weight:600;background:var(--accent,#d6ff3f);color:#141a05'
    : 'flex:1;text-align:center;padding:7px 6px;border-radius:9px;font-size:11.5px;font-weight:600;background:rgba(255,255,255,.06);color:#c8ccd2';

function WorkoutSheet({ wkDetail, actions }) {
  return (
    <>
      <div className="ctl" onClick={actions.closeWorkout} style={s('position:absolute;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
      <div className="scr" style={s('position:absolute;left:0;right:0;bottom:0;z-index:51;background:var(--bg);border-radius:26px 26px 0 0;border-top:1px solid var(--line2);max-height:88%;overflow-y:auto;animation:floatUp .3s ease;padding:14px 18px 32px')}>
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
        <div style={s('display:flex;gap:9px;margin-top:16px')}>
          <div className="ctl" onClick={() => actions.go('ride')} style={s('flex:1;background:var(--accent);color:var(--accent-ink);text-align:center;padding:14px;border-radius:13px;font-weight:700;font-size:14px')}>Start now</div>
          <div className="ctl" onClick={actions.closeWorkout} style={s('width:56px;background:var(--bg3);border:1px solid var(--line);border-radius:13px;display:flex;align-items:center;justify-content:center;color:var(--text2);font-size:13px;font-weight:600')}>Close</div>
        </div>
      </div>
    </>
  );
}

const dowLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const legend = [['Bike', 'var(--bike)'], ['Swim', 'var(--swim)'], ['Run', 'var(--run)'], ['Gym', 'var(--gym)']];

export default function Plan({ vm, state, actions }) {
  const week = state.planView === 'week';
  const coachToggleStyle = state.coachView
    ? 'background:var(--accent);color:var(--accent-ink)'
    : 'background:var(--bg3);color:var(--text2);border:1px solid var(--line)';

  return (
    <>
      <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
        <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:14px')}>
          <div><div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>This week</div><div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px')}>Training Plan</div></div>
          <div className="ctl" onClick={actions.toggleCoach} style={s(`${coachToggleStyle};border-radius:11px;padding:8px 11px;font-size:11.5px;font-weight:700;display:flex;align-items:center;gap:6px`)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>Coach
          </div>
        </div>

        {state.coachView && (
          <div style={s('background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:14px;padding:11px 13px;margin-bottom:14px;display:flex;gap:9px;align-items:center')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><path d="M12 2a10 10 0 1 0 10 10" /><path d="M22 4L12 14l-3-3" /></svg>
            <div style={s('font-size:12px;color:var(--text2);line-height:1.4')}><span style={s('color:var(--text);font-weight:600')}>Coach mode.</span> Edits apply to all squad athletes. Tap a day to assign.</div>
          </div>
        )}

        <div style={s('display:flex;gap:6px;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:4px;margin-bottom:16px')}>
          <div className="ctl" onClick={() => actions.setPlanView('week')} style={s(seg(week))}>Week</div>
          <div className="ctl" onClick={() => actions.setPlanView('month')} style={s(seg(!week))}>Month</div>
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
                <div key={p.day} className="ctl" onClick={() => actions.openWorkout(p.wk)} style={s(`background:var(--bg2);border:1px solid ${p.rowBorder};border-radius:16px;padding:12px 13px;display:flex;gap:12px;align-items:center`)}>
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
      </div>

      {state.showWorkout && <WorkoutSheet wkDetail={vm.wkDetail} actions={actions} />}
    </>
  );
}
