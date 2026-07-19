import { s } from '../lib/style.js';
import { metricCatalog, liveMetricValues, liveChartsView, liveRadarView, spreadRiders } from '../lib/liveMetrics.js';

// ---- Group side column: teammates front→back on a rail + rear-radar vehicle blip ----
function GroupColumn({ t }) {
  const riders = spreadRiders(t);
  const rv = liveRadarView(t);
  return (
    <div style={s('width:76px;flex:none;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:9px 6px;display:flex;flex-direction:column')}>
      <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700')}>Group</div>
      <div style={s('position:relative;flex:1;margin-top:9px')}>
        <div style={s('position:absolute;left:50%;top:0;bottom:0;width:2px;background:var(--line);transform:translateX(-50%)')} />
        {riders.map((r) => (
          <div key={r.initials} style={s(`position:absolute;left:50%;top:${r.top};transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:1px`)}>
            <div style={s(`width:24px;height:24px;border-radius:7px;background:${r.color};${r.ringStyle};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#0c0e11`)}>{r.initials}</div>
            {r.gapLabel && <span className="mono" style={s('font-size:8px;font-weight:700;color:var(--behind)')}>{r.gapLabel}</span>}
          </div>
        ))}
        {rv.hasVehicle && (
          <div style={s('position:absolute;left:50%;top:95%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:1px')}>
            <div style={s(`width:22px;height:22px;border-radius:7px;background:${rv.color};box-shadow:0 0 9px ${rv.color};display:flex;align-items:center;justify-content:center;font-size:12px`)}>🚗</div>
            <span className="mono" style={s(`font-size:8px;font-weight:700;color:${rv.color}`)}>{rv.closest}m</span>
          </div>
        )}
      </div>
      <div style={s(`font-size:10px;font-weight:700;line-height:1.2;margin-top:5px;color:${rv.color}`)}>{rv.label}</div>
    </div>
  );
}

// ---- a single field cell (metric / chart / map) with edit overlays ----
function FieldCell({ f, editing, actions, index }) {
  const stop = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };
  return (
    <div
      className="ctl"
      onClick={() => actions.openPicker(index)}
      draggable={editing}
      onDragStart={() => actions.onDragStart(index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => actions.onDropAt(index)}
      onPointerDown={() => { if (!editing) actions.pressStart(); }}
      onPointerUp={actions.pressEnd}
      onPointerLeave={actions.pressEnd}
      style={s(f.cellStyle)}
    >
      {f.kind === 'metric' && (
        <>
          <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600')}>{f.label}</div>
          <div style={s('display:flex;align-items:baseline;gap:4px;margin-top:auto')}>
            <span className="mono" style={s(f.valStyle)}>{f.value}</span>
            {f.unit && <span className="mono" style={s('font-size:12px;color:var(--text2);font-weight:600')}>{f.unit}</span>}
          </div>
        </>
      )}
      {f.kind === 'chart' && (
        <>
          <div style={s('display:flex;justify-content:space-between;align-items:baseline')}>
            <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600')}>{f.label}</div>
            <div className="mono" style={s(`font-size:16px;font-weight:700;color:${f.color}`)}>{f.value}<span style={s('font-size:9px;color:var(--text2)')}> {f.unit}</span></div>
          </div>
          <svg viewBox="0 0 300 64" preserveAspectRatio="none" style={{ width: '100%', flex: 1, minHeight: 36, marginTop: 6, display: 'block' }}>
            <polygon points={f.area} fill={f.color} opacity=".14" />
            <polyline points={f.pts} fill="none" stroke={f.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </>
      )}
      {f.kind === 'map' && (
        <>
          <div style={s('position:absolute;inset:0')}>
            <svg viewBox="0 0 344 240" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block' }}>
              <rect width="344" height="240" fill="var(--bg3)" />
              <g stroke="var(--line)" strokeWidth="1"><path d="M0,60 H344 M0,120 H344 M0,180 H344 M86,0 V240 M172,0 V240 M258,0 V240" /></g>
              <path d="M28,200 C24,150 66,120 110,122 C156,124 168,70 210,64 C258,56 306,78 314,120" fill="none" stroke="var(--line2)" strokeWidth="8" strokeLinecap="round" />
              <path d="M28,200 C24,150 66,120 110,122 C156,124 168,70 210,64 C258,56 306,78 314,120" fill="none" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" />
              <circle cx="150" cy="98" r="10" fill="var(--accent)" stroke="var(--bg)" strokeWidth="3" />
              <circle cx="196" cy="72" r="7" fill="#ff9a4c" stroke="var(--bg)" strokeWidth="2.5" />
              <circle cx="118" cy="120" r="7" fill="#5a86ff" stroke="var(--bg)" strokeWidth="2.5" />
            </svg>
          </div>
          <div style={s('position:absolute;top:10px;left:11px;font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;font-weight:600;background:color-mix(in srgb,var(--bg) 60%,transparent);padding:2px 7px;border-radius:6px')}>Route</div>
        </>
      )}
      {editing && (
        <div onClick={(e) => { stop(e); actions.setHero(index); }} style={s(`position:absolute;top:8px;left:8px;width:20px;height:20px;border-radius:6px;background:${f.starBg};display:flex;align-items:center;justify-content:center`)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill={f.starFill} stroke={f.starStroke} strokeWidth="2" strokeLinejoin="round"><path d="M12 3l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 17.8 6.2 21.3l1.6-6.6L2.6 9.8l6.8-.5z" /></svg>
        </div>
      )}
      {editing && (
        <div style={s('position:absolute;top:8px;right:8px;width:20px;height:20px;border-radius:6px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text3)')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></svg>
        </div>
      )}
    </div>
  );
}

// ---- edit panel (field count / arrangement / side column / add-delete page) ----
function seg(activeVal, val, label, onSet) {
  const on = activeVal === val;
  return (
    <div key={label} className="ctl" onClick={onSet} style={s(`flex:1;text-align:center;padding:6px;border-radius:8px;font-size:11px;font-weight:700;${on ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);color:var(--text2);border:1px solid var(--line)'}`)}>{label}</div>
  );
}

function EditPanel({ page, actions }) {
  const count = page.fields.length;
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px;margin:10px 12px 0')}>
      <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:7px')}>Fields</div>
      <div style={s('display:flex;gap:6px')}>{[2, 3, 4, 6].map((n) => seg(count, n, String(n), () => actions.setPageCount(n)))}</div>
      <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:11px 0 7px')}>Arrangement</div>
      <div style={s('display:flex;gap:6px')}>{[['grid', 'Grid'], ['hero', 'Hero']].map(([id, l]) => seg(page.layout, id, l, () => actions.setPageLayout(id)))}</div>
      <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:11px 0 7px')}>Side column</div>
      <div style={s('display:flex;gap:6px')}>{[['none', 'Off'], ['group', 'Column']].map(([id, l]) => seg(page.side || 'none', id, l, () => actions.setPageSide(id)))}</div>
      <div style={s('display:flex;gap:8px;margin-top:12px')}>
        <div className="ctl" onClick={actions.addPage} style={s('flex:1;text-align:center;padding:9px;border-radius:10px;font-size:12px;font-weight:700;background:var(--bg3);border:1px dashed var(--line2);color:var(--text2)')}>+ Add page</div>
        <div className="ctl" onClick={actions.deletePage} style={s('width:46px;background:var(--bg3);border:1px solid var(--line);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--bad)')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
        </div>
      </div>
      <div style={s('font-size:11px;color:var(--text3);margin-top:10px;line-height:1.4')}>Tap any field to change it — pick a metric, a chart, or the route map.</div>
    </div>
  );
}

// ---- field picker bottom sheet (Charts / Map / Metrics) ----
function PickerRow({ label, unit, active, onPick }) {
  return (
    <div onClick={onPick} style={s(`cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:11px 13px;border-radius:11px;border:1px solid ${active ? 'color-mix(in srgb,var(--accent) 50%,transparent)' : 'var(--line)'};background:${active ? 'var(--accent-dim)' : 'var(--bg2)'}`)}>
      <span style={s('font-size:14px;font-weight:600')}>{label}</span>
      <span className="mono" style={s('font-size:11px;color:var(--text3)')}>{unit}</span>
    </div>
  );
}

function PickerSheet({ page, slot, actions }) {
  const cur = page.fields[slot];
  const charts = [['chart:spd', 'Speed chart', 'graph'], ['chart:hr', 'HR chart', 'graph'], ['chart:power', 'Power chart', 'graph']];
  const maps = [['map', 'Route map', 'map']];
  const metrics = Object.keys(metricCatalog).map((id) => [id, metricCatalog[id].label, metricCatalog[id].unit]);
  const section = (title, rows) => (
    <>
      <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:7px')}>{title}</div>
      <div style={s('display:flex;flex-direction:column;gap:7px;margin-bottom:14px')}>
        {rows.map(([tok, label, unit]) => <PickerRow key={tok} label={label} unit={unit} active={cur === tok} onPick={() => actions.pickField(tok)} />)}
      </div>
    </>
  );
  return (
    <>
      <div className="ctl" onClick={actions.closePicker} style={s('position:absolute;inset:0;background:rgba(0,0,0,.55);z-index:50')} />
      <div className="scr" style={s('position:absolute;left:0;right:0;bottom:0;z-index:51;background:var(--bg);border-radius:26px 26px 0 0;border-top:1px solid var(--line2);max-height:80%;overflow-y:auto;padding:14px 18px 32px;animation:floatUp .3s ease')}>
        <div style={s('width:40px;height:4px;border-radius:3px;background:var(--line2);margin:0 auto 14px')} />
        <div style={s('font-size:17px;font-weight:700;letter-spacing:-.3px;margin-bottom:12px')}>Choose a field</div>
        {section('Charts', charts)}
        {section('Map', maps)}
        {section('Metrics', metrics)}
      </div>
    </>
  );
}

// ---- the unified full-screen rotating page system ----
export default function LivePages({ t, lp }) {
  const { pages, pageIdx, editFields, picker, autoRotate, pagerVisible, actions } = lp;
  const page = pages[pageIdx];
  const side = page.side || 'none';
  const withSide = side !== 'none';
  const count = page.fields.length;
  const cols = count <= 2 ? 1 : 2;
  const big = withSide
    ? (count <= 2 ? 32 : count <= 4 ? 26 : 22)
    : (count <= 2 ? 54 : count <= 3 ? 46 : count <= 4 ? 40 : count <= 6 ? 34 : 28);
  const heroIdx = page.layout === 'hero' ? (page.heroIndex == null ? 0 : page.heroIndex) : -1;

  const mv = liveMetricValues(t);
  const charts = liveChartsView(t);

  const fields = page.fields.map((tok, i) => {
    const hero = i === heroIdx;
    const cellStyle = 'position:relative;background:var(--bg2);border:1px solid ' +
      (editFields ? 'color-mix(in srgb,var(--accent) 55%,transparent)' : 'var(--line)') +
      ';border-radius:14px;padding:11px 12px;display:flex;flex-direction:column;overflow:hidden;' +
      (editFields ? 'cursor:grab;' : '') + (hero ? 'grid-column:1/-1;' : '');
    const base = {
      cellStyle,
      starBg: hero ? 'var(--accent)' : 'var(--bg3)',
      starFill: hero ? 'var(--accent-ink)' : 'none',
      starStroke: hero ? 'var(--accent-ink)' : 'var(--text2)',
    };
    if (tok === 'map') return { ...base, kind: 'map', label: 'Route' };
    if (charts[tok]) { const c = charts[tok]; return { ...base, kind: 'chart', label: c.label, value: c.cur, unit: c.unit, color: c.color, pts: c.pts, area: c.area }; }
    const m = metricCatalog[tok] || { label: tok, unit: '' };
    const val = mv[tok] || { v: '—' };
    const vs = hero ? big + 10 : big;
    const color = val.color || (hero ? 'var(--accent)' : 'var(--text)');
    return { ...base, kind: 'metric', label: m.label, unit: m.unit, value: val.v, valStyle: `font-size:${vs}px;font-weight:700;line-height:.95;letter-spacing:-1px;color:${color}` };
  });

  const gridStyle = `flex:1;display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;grid-auto-rows:1fr;min-width:0`;
  const pagerAnim = (pagerVisible || editFields)
    ? 'opacity:1;transform:none;transition:opacity .3s ease,transform .3s ease'
    : 'opacity:0;transform:translateY(26px);pointer-events:none;transition:opacity .3s ease,transform .3s ease';

  return (
    <>
      {/* full-screen page: optional Group column + fields grid */}
      <div style={s('display:flex;gap:9px;height:544px;padding:0 12px')} onPointerDown={actions.pokePager}>
        {withSide && <GroupColumn t={t} />}
        <div style={s(gridStyle)}>
          {fields.map((f, i) => <FieldCell key={i} f={f} index={i} editing={editFields} actions={actions} />)}
        </div>
      </div>

      {editFields && <EditPanel page={page} actions={actions} />}

      {/* unified pager: prev · page name + dots · Auto · Edit · next */}
      <div style={s(`position:absolute;left:12px;right:12px;bottom:100px;z-index:34;display:flex;align-items:center;gap:9px;background:color-mix(in srgb,var(--bg2) 92%,transparent);backdrop-filter:blur(14px);border:1px solid var(--line);border-radius:16px;padding:9px 11px;box-shadow:0 10px 26px -12px rgba(0,0,0,.6);${pagerAnim}`)}>
        <div className="ctl" onClick={actions.prevPage} style={s('width:30px;height:30px;border-radius:9px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
        </div>
        <div style={s('flex:1;text-align:center;min-width:0')}>
          <div style={s('font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{page.name}</div>
          <div style={s('display:flex;gap:6px;justify-content:center;margin-top:5px')}>
            {pages.map((p, i) => (
              <div key={i} onClick={() => actions.goPage(i)} style={s(`width:8px;height:8px;border-radius:50%;cursor:pointer;transition:all .15s;${i === pageIdx ? 'background:var(--accent);transform:scale(1.4)' : 'background:var(--line2)'}`)} />
            ))}
          </div>
        </div>
        <div className="ctl" onClick={actions.toggleAutoRotate} style={s(`font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:6px 8px;border-radius:9px;flex:none;${autoRotate ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'}`)}>Auto</div>
        <div className="ctl" onClick={actions.toggleEdit} style={s(`font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:6px 8px;border-radius:9px;flex:none;${editFields ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'}`)}>{editFields ? 'Done' : 'Edit'}</div>
        <div className="ctl" onClick={actions.nextPage} style={s('width:30px;height:30px;border-radius:9px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
        </div>
      </div>

      {picker.open && <PickerSheet page={page} slot={picker.slot} actions={actions} />}
    </>
  );
}
