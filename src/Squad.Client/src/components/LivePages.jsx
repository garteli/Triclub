import { useRef } from 'react';
import { s } from '../lib/style.js';
import { metricCatalog, liveMetricValues, liveChartsView, liveRadarView, spreadRiders } from '../lib/liveMetrics.js';
import TileMap from './TileMap.jsx';

// ---- Group side column: teammates front→back on a rail + rear-radar vehicle blip ----
function GroupColumn({ tel }) {
  const riders = spreadRiders(tel);
  const rv = liveRadarView(tel);
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
          // Distinct round blip (riders are rounded squares). Position tracks the closing
          // distance — far → bottom of the rail, near → up by "you" — and glides between
          // 1 Hz updates so it visibly moves closer.
          <div style={s(`position:absolute;left:50%;top:${Math.max(10, Math.min(98, 6 + (rv.dist / 150) * 92)).toFixed(1)}%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;transition:top .9s linear;z-index:3`)}>
            <div style={s(`width:26px;height:26px;border-radius:50%;background:${rv.color};box-shadow:0 0 ${rv.hi ? 15 : 9}px ${rv.color};border:2px solid var(--bg2);display:flex;align-items:center;justify-content:center;font-size:13px`)}>🚗</div>
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
      className={'ctl' + (f.kind === 'metric' ? ' live-tile' : '')}
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
          <div style={s('display:flex;align-items:baseline;gap:4px;margin-top:auto;min-width:0')}>
            <span className={'mono live-metric-val' + (f.hero ? ' hero' : '')} style={s(`--vf:${f.vf}px;color:${f.color}`)}>{f.value}</span>
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
            {f.pts.length ? (
              <TileMap points={f.pts} W={344} H={240} radius={0} pad={28}>
                {(project) => f.riders.map((r, k) => {
                  const p = project(r.lat, r.lon);
                  return <circle key={k} cx={p.x} cy={p.y} r={r.you ? 9 : 6} fill={r.you ? 'var(--accent)' : r.color} stroke="#fff" strokeWidth={r.you ? 3 : 2.5} />;
                })}
              </TileMap>
            ) : (
              <div style={s('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg3);color:var(--text3);font-size:11px;text-align:center;padding:0 16px')}>Waiting for GPS…</div>
            )}
          </div>
          <div style={s('position:absolute;top:10px;left:11px;font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;font-weight:600;background:color-mix(in srgb,var(--bg) 60%,transparent);padding:2px 7px;border-radius:6px;z-index:2')}>Route</div>
        </>
      )}
      {editing && (
        <div onClick={(e) => { stop(e); actions.setHero(index); }} style={s(`position:absolute;top:8px;left:8px;width:20px;height:20px;border-radius:6px;background:${f.starBg};display:flex;align-items:center;justify-content:center`)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill={f.starFill} stroke={f.starStroke} strokeWidth="2" strokeLinejoin="round"><path d="M12 3l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 17.8 6.2 21.3l1.6-6.6L2.6 9.8l6.8-.5z" /></svg>
        </div>
      )}
      {editing && (
        // Cog → open the field picker for this tile. In edit mode only; tapping the
        // tile body no longer opens it (that just enters edit via long-press).
        <div onClick={(e) => { stop(e); actions.openPicker(index); }} style={s('position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:7px;background:var(--accent);display:flex;align-items:center;justify-content:center;color:var(--accent-ink)')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></svg>
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
      <div style={s('font-size:11px;color:var(--text3);margin-top:10px;line-height:1.4')}>Tap a tile's ⚙ to change it — pick a metric, a chart, or the route map. Drag tiles to reorder.</div>
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
export default function LivePages({ tel, lp }) {
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

  const mv = liveMetricValues(tel);
  const charts = liveChartsView(tel);

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
    if (tok === 'map') {
      // Real rider positions from the hub (those with a GPS fix). Empty → "Waiting for GPS".
      const riders = (tel?.riders || []).filter((r) => r.lat != null && r.lon != null);
      const pts = riders.map((r) => [r.lat, r.lon]);
      return { ...base, kind: 'map', label: 'Route', riders, pts };
    }
    if (charts[tok]) { const c = charts[tok]; return { ...base, kind: 'chart', label: c.label, value: c.cur, unit: c.unit, color: c.color, pts: c.pts, area: c.area }; }
    const m = metricCatalog[tok] || { label: tok, unit: '' };
    const val = mv[tok] || { v: '—' };
    const vs = hero ? big + 10 : big;
    const color = val.color || (hero ? 'var(--accent)' : 'var(--text)');
    // vf is the px fallback (count-based); the .live-metric-val class scales it up to
    // fill the tile via container queries where supported.
    return { ...base, kind: 'metric', hero, label: m.label, unit: m.unit, value: val.v, vf: vs, color };
  });

  // Horizontal swipe to change pages (left → next, right → prev). Skipped while
  // editing so drag-to-reorder keeps the pointer. A mostly-horizontal move past the
  // threshold counts; vertical scrolls and taps are ignored.
  const swipe = useRef(null);
  const onRowPointerDown = (e) => {
    actions.pokePager();
    swipe.current = editFields ? null : { x: e.clientX, y: e.clientY };
  };
  const onRowPointerUp = (e) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      if (dx < 0) actions.nextPage(); else actions.prevPage();
    }
  };

  const gridStyle = `flex:1;display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;grid-auto-rows:1fr;min-width:0`;
  const pagerAnim = (pagerVisible || editFields)
    ? 'opacity:1;transform:none;transition:opacity .3s ease,transform .3s ease'
    : 'opacity:0;transform:translateY(26px);pointer-events:none;transition:opacity .3s ease,transform .3s ease';

  return (
    <>
      {/* full-screen page: optional Group column + fields grid */}
      <div className="live-row" style={s('display:flex;gap:9px;padding:0 12px;touch-action:pan-y')} onPointerDown={onRowPointerDown} onPointerUp={onRowPointerUp}>
        {withSide && <GroupColumn tel={tel} />}
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
