import { useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { FREE_COLS, FREE_ROWS, ensureSlots } from '../hooks/useLivePages.js';

const FREE_GAP = 6; // px gap between free-grid cells (kept in sync with the grid's `gap`)
import { metricCatalog, metricGroupsFor, liveMetricValues, liveChartsView, liveRadarView, spreadRiders, pelotonView, metricAccent, metricIcon } from '../lib/liveMetrics.js';
import { LIVE_PRESETS, LIVE_PRESET_SETS, PRESET_TOKEN_LABEL } from '../lib/livePresets.js';
import LiveMapGL from './LiveMapGL.jsx';
import LiveElevationStrip from './LiveElevationStrip.jsx';
import LiveElevationChart from './LiveElevationChart.jsx';
import { ClimbField } from './ClimbPro.jsx';
import { mergePeerRanges } from '../lib/ranging.js';

// Tabler-style metric glyphs (from the Live Data Fields handoff). [type, innerSVG]; fill icons
// paint with currentColor, stroke icons stroke it.
const ICON_PATHS = {
  clock: ['s', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  route: ['s', '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h6a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6"/>'],
  gauge: ['s', '<path d="M12 14l4-4M4.5 18a9 9 0 1 1 15 0z"/><circle cx="12" cy="14" r="1"/>'],
  rotate: ['s', '<path d="M21 12a9 9 0 1 1-2.6-6.3"/><path d="M21 3v4h-4"/>'],
  heart: ['f', '<path d="M12 21s-8-5.3-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.7-8 11-8 11z"/>'],
  bolt: ['f', '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>'],
  mountain: ['s', '<path d="M3 20l6-11 4 6 2-3 6 8z"/>'],
  compass: ['s', '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'],
  activity: ['s', '<path d="M2 12h4l3 8 4-16 3 8h4"/>'],
  users: ['s', '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 5.5a3.2 3.2 0 0 1 0 6M18 20a6.5 6.5 0 0 0-3-5.4"/>'],
  arrowUp: ['s', '<path d="M12 20V5M6 11l6-6 6 6"/>'],
  arrowDown: ['s', '<path d="M12 4v15M6 13l6 6 6-6"/>'],
  cog: ['s', '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'],
  battery: ['s', '<rect x="2" y="7" width="17" height="10" rx="2.5"/><path d="M22 10v4"/>'],
  flame: ['f', '<path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-1.5.6-2.7 1.4-3.6C8.6 8.6 9 10 10 10c0-2.5 2-5 2-8z"/>'],
  thermometer: ['s', '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'],
};
function MetricIcon({ k, color, size = 15 }) {
  const p = ICON_PATHS[k] || ICON_PATHS.activity;
  const fill = p[0] === 'f';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : 'none'} stroke={fill ? 'none' : color}
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}
      dangerouslySetInnerHTML={{ __html: p[1] }} />
  );
}

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

// ---- Peloton field: 2D pack spread (fore-aft × lateral) + "% time in lead" board ----
// Precise UWB (Nearby Interaction) status + per-teammate distances, shown on the peloton
// view. Doubles as the on-device diagnostic: it always renders the UWB state so you can
// see whether the U1/U2 radio is supported, searching, or actively ranging.
function UwbBar({ uwb, blePeers }) {
  const supported = !!uwb?.supported;
  const rows = mergePeerRanges(uwb?.peers, blePeers)
    .filter((p) => p.distanceM != null)
    .sort((a, b) => a.distanceM - b.distanceM);
  const anyUwb = rows.some((p) => p.src === 'uwb');

  let status;
  if (rows.length === 0) status = { text: `${supported ? 'UWB' : 'BLE'} · searching for a teammate…`, color: supported ? 'var(--warn)' : 'var(--text3)' };
  else status = { text: `${anyUwb ? 'UWB' : 'BLE'} · ranging ${rows.length}`, color: 'var(--good)' };

  return (
    <div style={s('flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px')}>
      <span style={s(`font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${status.color}`)}>{status.text}</span>
      {rows.map((p) => (
        <span key={p.id} className="mono" style={s('font-size:10px;font-weight:700;color:var(--text);background:var(--bg3);border:1px solid var(--line);border-radius:9px;padding:2px 7px')}>
          {p.src === 'ble' ? `~${p.distanceM.toFixed(1)}` : p.distanceM.toFixed(2)} m{p.dir ? ' ›' : ''}
        </span>
      ))}
    </div>
  );
}

function PelotonField({ v }) {
  if (!v || v.empty) {
    return (
      <>
        <UwbBar uwb={v?.uwb} blePeers={v?.blePeers} />
        <div style={s('flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg3);border-radius:11px;color:var(--text3);font-size:11px;text-align:center;padding:0 18px')}>
          Waiting for teammates — the pack spread appears once riders are streaming.
        </div>
      </>
    );
  }
  return (
    <>
      <UwbBar uwb={v.uwb} blePeers={v.blePeers} />
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;flex:none')}>
        <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600')}>Peloton</div>
        <div className="mono" style={s('font-size:10px;color:var(--text2);font-weight:600')}>
          {v.lengthM != null ? `${v.lengthM}m long · ` : ''}{v.radiusM}m view
        </div>
      </div>
      {/* the field: everyone on ONE centre axis (fore-aft only); ±radius window, edges = beyond it */}
      <div style={s('position:relative;flex:1;min-height:120px;margin-top:8px;border-radius:11px;background:var(--bg3);border:1px solid var(--line);overflow:hidden')}>
        <div style={s('position:absolute;left:50%;top:6%;bottom:6%;width:2px;background:var(--line2);transform:translateX(-50%)')} />
        <div style={s('position:absolute;top:5px;left:0;right:0;text-align:center;font-size:8px;font-weight:700;letter-spacing:1px;color:var(--text3)')}>▲ FRONT</div>
        <div style={s('position:absolute;bottom:5px;left:0;right:0;text-align:center;font-size:8px;font-weight:700;letter-spacing:1px;color:var(--text3)')}>BACK</div>
        {v.plot.map((r) => (
          <div key={r.id} style={s(`position:absolute;left:50%;top:${(r.y * 100).toFixed(1)}%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:1px;transition:top .9s linear;z-index:${r.isLeader ? 3 : 2}`)}>
            <div style={s(`width:24px;height:24px;border-radius:7px;background:${r.color};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#0c0e11;${r.you ? 'box-shadow:0 0 0 2px var(--accent)' : ''}${r.isLeader ? ';outline:2px solid var(--good);outline-offset:1px' : ''};${r.offRadius ? ';opacity:.6;outline:1.5px dashed var(--behind);outline-offset:1px' : ''}`)}>{r.initials}</div>
            {r.offRadius
              ? <span className="mono" style={s('font-size:8.5px;font-weight:700;color:var(--behind);line-height:1')}>{r.arrow === 'up' ? '▲' : '▼'} {r.nextGapM}m</span>
              : r.isLeader
                ? <span style={s('font-size:8px;font-weight:700;color:var(--good);line-height:1')}>lead</span>
                : r.dropped && r.gapM > 0 && <span className="mono" style={s('font-size:8px;font-weight:700;color:var(--behind);line-height:1')}>+{r.gapM}m</span>}
          </div>
        ))}
      </div>
      {/* % time in lead — compact board, highest first */}
      <div style={s('flex:none;margin-top:8px;display:flex;flex-direction:column;gap:4px')}>
        <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600')}>% time in lead</div>
        {v.samples === 0 ? (
          <div style={s('font-size:10px;color:var(--text3)')}>Tracking begins with two or more riders.</div>
        ) : (
          v.board.slice(0, 4).map((r) => (
            <div key={r.id} style={s('display:flex;align-items:center;gap:7px')}>
              <span style={s(`width:9px;height:9px;border-radius:3px;background:${r.color};flex:none;${r.you ? 'box-shadow:0 0 0 1.5px var(--accent)' : ''}`)} />
              <span style={s(`font-size:11px;font-weight:600;flex:none;width:26px;${r.you ? 'color:var(--accent)' : ''}`)}>{r.initials}</span>
              <div style={s('flex:1;height:6px;border-radius:3px;background:var(--bg4);overflow:hidden')}><div style={s(`height:100%;width:${r.leadPct}%;background:${r.isLeader ? 'var(--good)' : 'var(--accent)'};border-radius:3px`)} /></div>
              <span className="mono" style={s('font-size:11px;font-weight:700;width:32px;text-align:right')}>{r.leadPct}%</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// Tiles whose value uses the container-query-scaled `.live-metric-val` font MUST carry `.live-tile`
// (it sets `container-type: size`, the basis for the cqw/cqh sizing). Metric and radar tiles both do
// — miss one and its value sizes against a larger ancestor and overflows (e.g. radar "Clear").
const usesMetricVal = (f) => f.kind === 'metric' || f.kind === 'radar';

// ---- Rear-radar field: closest approaching vehicle + a proximity bar (real Varia/BLE radar) ----
function RadarField({ v, mono }) {
  const color = mono ? '#c9d0d9' : v.color;
  const valColor = v.hasVehicle ? color : (mono ? '#dfe4ea' : 'var(--good)');
  // Closer vehicle → fuller bar (0–150 m window). Empty when the road is clear.
  const near = v.hasVehicle && v.dist != null ? Math.max(6, Math.min(100, 100 - (v.dist / 150) * 100)) : 0;
  return (
    <>
      <div style={s(`position:absolute;top:0;left:0;right:0;height:3px;background:${color};opacity:.9`)} />
      <div style={s('display:flex;align-items:center;justify-content:center;gap:6px;min-width:0')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
          <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" /><path d="M3 11h18v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1z" />
        </svg>
        <span style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1.1px;font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>Rear radar</span>
      </div>
      <div style={s('flex:1;display:flex;align-items:center;justify-content:center;gap:5px;min-width:0')}>
        <span className={'mono live-metric-val'} style={s(`--vf:34px;--vfw:26cqw;color:${valColor}`)}>{v.hasVehicle ? v.closest : 'Clear'}</span>
        {v.hasVehicle && <span className="mono" style={s('font-size:12px;color:var(--text2);font-weight:600')}>m</span>}
      </div>
      <div style={s('height:16px;display:flex;align-items:center')}>
        <div style={s('width:100%;height:6px;border-radius:3px;background:var(--bg4);overflow:hidden')}>
          <div style={s(`height:100%;width:${near}%;background:${color};border-radius:3px;transition:width .9s linear`)} />
        </div>
      </div>
    </>
  );
}

// ---- the kind-specific content of a tile (metric / chart / map / …), no wrapper ----
function FieldBody({ f, editing, indoor, mySport, climb, mono }) {
  return (
    <>
      {f.kind === 'metric' && (
        <>
          {/* accent bar */}
          <div style={s(`position:absolute;top:0;left:0;right:0;height:3px;background:${f.barColor};opacity:.9`)} />
          {/* icon + label, centred */}
          <div style={s('display:flex;align-items:center;justify-content:center;gap:6px;min-width:0')}>
            <MetricIcon k={f.icon} color={f.barColor} />
            <span style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1.1px;font-weight:700;line-height:1.2;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{f.label}</span>
          </div>
          {/* value, centred */}
          <div style={s('flex:1;display:flex;align-items:center;justify-content:center;gap:5px;min-width:0')}>
            <span className={'mono live-metric-val' + (f.hero ? ' hero' : '')} style={s(`--vf:${f.vf}px;--vfw:${f.vfw}cqw;color:${f.color}`)}>{f.value}</span>
            {f.unit && <span className="mono" style={s('font-size:12px;color:var(--text2);font-weight:600')}>{f.unit}</span>}
          </div>
          {/* mini viz row (only where we have real data to show) */}
          {f.viz && (
            <div style={s('height:16px;display:flex;align-items:center;justify-content:center')}>
              {f.viz.type === 'wedge' && (
                <svg width="30" height="16" viewBox="0 0 30 16"><path d={`M1 15 L29 15 L29 ${f.viz.wedgeY} Z`} fill={f.barColor} opacity=".85" /></svg>
              )}
              {f.viz.type === 'dots' && (
                <div style={s('display:flex;gap:4px')}>
                  {Array.from({ length: f.viz.total }, (_, i) => (
                    <span key={i} style={s(`width:7px;height:7px;border-radius:50%;background:${i < f.viz.n ? f.barColor : 'rgba(255,255,255,.16)'}`)} />
                  ))}
                </div>
              )}
              {f.viz.type === 'fill' && (
                <div style={s(`width:40px;height:16px;border:1.5px solid ${f.barColor};border-radius:3px;padding:2px;position:relative`)}>
                  <div style={s(`height:100%;width:${f.viz.pct}%;background:${f.barColor};border-radius:1px`)} />
                  <div style={s(`position:absolute;right:-4px;top:4px;width:2.5px;height:6px;background:${f.barColor};border-radius:0 1px 1px 0`)} />
                </div>
              )}
            </div>
          )}
        </>
      )}
      {f.kind === 'chart' && (
        <>
          <div style={s('display:flex;align-items:flex-start;justify-content:space-between;gap:6px')}>
            <div style={s('display:flex;align-items:center;gap:6px;min-width:0')}>
              <span style={s(`width:8px;height:8px;border-radius:2px;background:${f.color};flex:none`)} />
              <span style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:1.1px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{f.label}</span>
            </div>
            <div style={s('display:flex;align-items:baseline;gap:3px;flex:none')}>
              <span className="mono" style={s(`font-size:20px;font-weight:700;line-height:.9;color:${f.color};letter-spacing:-.5px`)}>{f.value}</span>
              {f.unit && <span style={s('font-size:10px;font-weight:600;color:var(--text2)')}>{f.unit}</span>}
            </div>
          </div>
          <svg viewBox="0 0 300 64" preserveAspectRatio="none" style={{ width: '100%', flex: 1, minHeight: 36, marginTop: 8, display: 'block' }}>
            <polygon points={f.area} fill={f.color} opacity=".2" />
            <polyline points={f.pts} fill="none" stroke={f.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </>
      )}
      {f.kind === 'elev' && <LiveElevationChart route={f.route} you={f.you} source={f.source} indoor={indoor} mono={mono} />}
      {f.kind === 'climbpro' && <ClimbField climb={climb} indoor={indoor} mono={mono} />}
      {f.kind === 'radar' && <RadarField v={f.radar} mono={mono} />}
      {f.kind === 'peloton' && <PelotonField v={f.v} />}
      {f.kind === 'map' && (
        <>
          {/* "Route map + elevation" reserves a strip at the bottom for the course's elevation profile. */}
          {(() => { const EH = f.showElev && f.course.length >= 2 ? 60 : 0; return (
          <>
          <div style={s(`position:absolute;top:0;left:0;right:0;bottom:${EH}px`)}>
            {f.pts.length ? (
              <LiveMapGL pts={f.pts} course={f.course} path={f.path} riders={f.riders} mySport={mySport} interactive={!editing} />
            ) : (
              <div style={s('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg3);color:var(--text3);font-size:11px;text-align:center;padding:0 16px')}>{indoor ? 'Indoor session — no map' : 'Waiting for GPS…'}</div>
            )}
          </div>
          {EH > 0 && <LiveElevationStrip route={f.course} you={f.you} height={EH} />}
          </>
          ); })()}
          <div style={s('position:absolute;top:10px;left:11px;font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;font-weight:600;background:color-mix(in srgb,var(--bg) 60%,transparent);padding:2px 7px;border-radius:6px;z-index:2')}>Route</div>
          {f.packFused && (
            // BLE pack-ranging is live: badge the map with a pulse + the fused gap to the
            // nearest teammate (positions on this map are BLE-tightened, not raw GPS).
            <div style={s('position:absolute;top:10px;right:11px;display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:var(--good);background:color-mix(in srgb,var(--good) 16%,var(--bg) 70%);padding:2px 8px;border-radius:6px;z-index:2')}>
              <span style={s('width:6px;height:6px;border-radius:50%;background:var(--good);animation:pulseDot 1.4s infinite')} />
              <span className="mono">BLE{f.packGap != null ? ` · ${f.packGap} m` : ''}</span>
            </div>
          )}
        </>
      )}
    </>
  );
}

// A cog button (opens the field picker) — shared by the grid + free wrappers.
function CogBtn({ onClick, style }) {
  return (
    <div onClick={onClick} onPointerDown={(e) => e.stopPropagation()} style={s(`position:absolute;width:22px;height:22px;border-radius:7px;background:var(--accent);display:flex;align-items:center;justify-content:center;color:var(--accent-ink);z-index:3;${style}`)}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></svg>
    </div>
  );
}

// ---- a single field cell in the classic (grid / hero) layout, with edit overlays ----
// Reorder is pointer-based (works on touch + mouse): in edit mode a drag picks the tile up and
// dropping it over another tile (hit-tested via elementFromPoint) swaps their order.
function FieldCell({ f, editing, actions, index, indoor, mySport, climb, mono }) {
  const stop = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };
  const onDown = (e) => {
    if (!editing) { if (f.kind !== 'map') actions.pressStart(); return; }
    e.preventDefault();                       // no text selection / native image drag
    actions.onDragStart(index);
    const drop = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const t = el && el.closest && el.closest('[data-fi]');
      actions.onDropAt(t ? Number(t.getAttribute('data-fi')) : index); // drop-on-self = no-op, clears state
    };
    window.addEventListener('pointerup', drop, { once: true });
  };
  return (
    <div
      className={'ctl' + (usesMetricVal(f) ? ' live-tile' : '')}
      data-fi={index}
      onPointerDown={onDown}
      onPointerUp={actions.pressEnd}
      onPointerLeave={actions.pressEnd}
      style={s(f.cellStyle + (editing ? 'touch-action:none;' : ''))}
    >
      <FieldBody f={f} editing={editing} indoor={indoor} mySport={mySport} climb={climb} mono={mono} />
      {editing && (
        <div onClick={(e) => { stop(e); actions.setHero(index); }} onPointerDown={(e) => e.stopPropagation()} style={s(`position:absolute;top:8px;left:8px;width:20px;height:20px;border-radius:6px;background:${f.starBg};display:flex;align-items:center;justify-content:center;z-index:3`)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill={f.starFill} stroke={f.starStroke} strokeWidth="2" strokeLinejoin="round"><path d="M12 3l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 17.8 6.2 21.3l1.6-6.6L2.6 9.8l6.8-.5z" /></svg>
        </div>
      )}
      {editing && <CogBtn onClick={(e) => { stop(e); actions.openPicker(index); }} style="top:8px;right:8px" />}
    </div>
  );
}

// ---- a tile in the free-form 8×20 layout: drag the body to move, the corner to resize ----
function FreeTile({ f, index, slot, editing, actions, indoor, mySport, climb, mono, gridRef }) {
  const drag = useRef(null);
  const stop = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };
  // Grid step in px (track + gap), so a pointer delta maps cleanly to whole cells.
  const step = () => {
    const r = gridRef.current?.getBoundingClientRect();
    return { cw: ((r?.width || 1) + FREE_GAP) / FREE_COLS, ch: ((r?.height || 1) + FREE_GAP) / FREE_ROWS };
  };
  const onMove = (e) => {
    const d = drag.current; if (!d) return;
    const { cw, ch } = step();
    const dc = Math.round((e.clientX - d.sx) / cw), dr = Math.round((e.clientY - d.sy) / ch);
    if (d.mode === 'move') {
      const x = Math.min(Math.max(1, d.x0 + dc), FREE_COLS - d.w0 + 1);
      const y = Math.min(Math.max(1, d.y0 + dr), FREE_ROWS - d.h0 + 1);
      actions.moveSlot(index, x, y);
    } else {
      const w = Math.min(Math.max(1, d.w0 + dc), FREE_COLS - d.x0 + 1);
      const h = Math.min(Math.max(1, d.h0 + dr), FREE_ROWS - d.y0 + 1);
      actions.resizeSlot(index, w, h);
    }
  };
  const begin = (mode, e) => { stop(e); if (e.cancelable) e.preventDefault(); drag.current = { mode, sx: e.clientX, sy: e.clientY, x0: slot.x, y0: slot.y, w0: slot.w, h0: slot.h }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no capture */ } };
  const end = (e) => { drag.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* none */ } if (!editing) actions.pressEnd(); };
  const onBodyDown = (e) => { if (editing) begin('move', e); else if (f.kind !== 'map') actions.pressStart(); };
  const pos = `grid-column:${slot.x} / span ${slot.w};grid-row:${slot.y} / span ${slot.h};`;
  return (
    <div
      className={usesMetricVal(f) ? 'live-tile' : undefined}
      onPointerDown={onBodyDown} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end} onPointerLeave={() => { if (!editing) actions.pressEnd(); }}
      style={s(f.cellStyle + pos + (editing ? 'cursor:grab;touch-action:none;' : ''))}
    >
      <FieldBody f={f} editing={editing} indoor={indoor} mySport={mySport} climb={climb} mono={mono} />
      {editing && (
        <div onClick={(e) => { stop(e); actions.removeField(index); }} onPointerDown={(e) => e.stopPropagation()} style={s('position:absolute;top:8px;left:8px;width:20px;height:20px;border-radius:6px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--bad);z-index:3')}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </div>
      )}
      {editing && <CogBtn onClick={(e) => { stop(e); actions.openPicker(index); }} style="top:8px;right:8px" />}
      {editing && (
        // resize grip (bottom-right)
        <div onPointerDown={(e) => begin('resize', e)} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end}
          style={s('position:absolute;right:0;bottom:0;width:24px;height:24px;display:flex;align-items:flex-end;justify-content:flex-end;padding:3px;cursor:nwse-resize;touch-action:none;z-index:3')}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><path d="M14 6L6 14M14 11l-3 3" /></svg>
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

function EditPanel({ page, actions, mono, family, onOpenPresets }) {
  const count = page.fields.length;
  const free = page.layout === 'free';
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px;margin:10px 12px 0')}>
      {/* Field count is auto-managed in free layout (add/remove per tile). */}
      {!free && (
        <>
          <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:7px')}>Fields</div>
          <div style={s('display:flex;gap:6px')}>{[1, 2, 3, 4, 6].map((n) => seg(count, n, String(n), () => actions.setPageCount(n)))}</div>
        </>
      )}
      <div style={s(`font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:${free ? '0' : '11px'} 0 7px`)}>Arrangement</div>
      <div style={s('display:flex;gap:6px')}>{[['grid', 'Grid'], ['hero', 'Hero'], ['free', 'Free']].map(([id, l]) => seg(page.layout, id, l, () => actions.setPageLayout(id)))}</div>
      {free ? (
        <>
          <div className="ctl" onClick={actions.addField} style={s('text-align:center;padding:9px;border-radius:10px;font-size:12px;font-weight:700;background:var(--bg3);border:1px dashed var(--line2);color:var(--text2);margin-top:11px')}>+ Add field</div>
        </>
      ) : (
        <>
          <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:11px 0 7px')}>Side column</div>
          <div style={s('display:flex;gap:6px')}>{[['none', 'Off'], ['group', 'Column']].map(([id, l]) => seg(page.side || 'none', id, l, () => actions.setPageSide(id)))}</div>
        </>
      )}
      <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:11px 0 7px')}>Colour</div>
      <div style={s('display:flex;gap:6px')}>{[[false, 'Colour'], [true, 'Mono']].map(([id, l]) => seg(!!mono, id, l, () => actions.setMono(id)))}</div>
      {/* Pro layouts — a gallery of persona-designed pages to drop in. Cycling-tuned (power,
          W/kg, climbs), so hidden on motorsport rides where those fields don't apply. */}
      {family !== 'motorsport' && (
        <div className="ctl" onClick={onOpenPresets} style={s('display:flex;align-items:center;justify-content:center;gap:7px;text-align:center;padding:10px;border-radius:10px;font-size:12px;font-weight:700;background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);color:var(--accent);margin-top:12px')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 17.8 6.2 21.3l1.6-6.6L2.6 9.8l6.8-.5z" /></svg>
          Pro layouts
        </div>
      )}
      <div style={s('display:flex;gap:8px;margin-top:12px')}>
        <div className="ctl" onClick={actions.addPage} style={s('flex:1;text-align:center;padding:9px;border-radius:10px;font-size:12px;font-weight:700;background:var(--bg3);border:1px dashed var(--line2);color:var(--text2)')}>+ Add page</div>
        <div className="ctl" onClick={actions.deletePage} style={s('width:46px;background:var(--bg3);border:1px solid var(--line);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--bad)')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
        </div>
      </div>
      <div style={s('font-size:11px;color:var(--text3);margin-top:10px;line-height:1.4')}>{free ? 'Drag a tile to move it, drag its corner to resize on the 8×20 grid. ⚙ changes the field, ✕ removes it.' : 'Tap a tile\'s ⚙ to change it — pick a metric, a chart, or the route map. Drag tiles to reorder.'}</div>
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

function PickerSheet({ page, slot, actions, family }) {
  const cur = page.fields[slot];
  const motor = family === 'motorsport';
  // Pull-down-to-dismiss: drag the handle/header down; past ~90px (or a flick) closes the sheet.
  const [dragY, setDragY] = useState(0);
  const [touched, setTouched] = useState(false); // once grabbed, stop replaying the entrance animation
  const drag = useRef(null);
  const onGrabDown = (e) => { setTouched(true); drag.current = { y: e.clientY, t: e.timeStamp }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no capture */ } };
  const onGrabMove = (e) => { if (drag.current) { const dy = e.clientY - drag.current.y; setDragY(dy > 0 ? dy : 0); } };
  const onGrabUp = (e) => {
    const d = drag.current; if (!d) return;
    const dy = e.clientY - d.y; const flick = dy > 30 && e.timeStamp - d.t < 250;
    drag.current = null;
    if (dy > 90 || flick) actions.closePicker(); else setDragY(0);
  };
  // Motorsport has no power meter — drop the power chart (metricGroupsFor hides the rest).
  const charts = [['chart:spd', 'Speed chart', 'graph'], ['chart:hr', 'HR chart', 'graph'], ...(motor ? [] : [['chart:power', 'Power chart', 'graph']]), ['elev:track', 'Elevation chart', 'graph'], ['climbpro', 'Climb view', 'ClimbPro']];
  const maps = [['map', 'Route map', 'map'], ['map+elev', 'Route map + elevation', 'map'], ['elev:route', 'Route elevation', 'chart']];
  const group = [['peloton', 'Peloton spread', '2D'], ['radar', 'Rear radar', 'safety']];
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
      <div className="ctl" onClick={actions.closePicker} style={s(`position:absolute;inset:0;background:rgba(0,0,0,${(0.55 * Math.max(0, 1 - dragY / 400)).toFixed(2)});z-index:50`)} />
      <div className="scr" style={s(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:var(--bg);border-radius:26px 26px 0 0;border-top:1px solid var(--line2);max-height:80%;overflow-y:auto;padding:14px 18px 32px;${dragY ? `transform:translateY(${dragY}px);transition:none` : (touched ? 'transform:translateY(0);transition:transform .22s ease' : 'animation:floatUp .3s ease')}`)}>
        {/* grab zone — handle + title; drag it down to dismiss */}
        <div onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp} style={s('touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;margin:-14px -18px 0;padding:14px 18px 2px')}>
          <div style={s('width:40px;height:4px;border-radius:3px;background:var(--line2);margin:0 auto 14px')} />
          <div style={s('font-size:17px;font-weight:700;letter-spacing:-.3px;margin-bottom:12px')}>Choose a field</div>
        </div>
        {section('Charts', charts)}
        {section('Group', group)}
        {section('Map', maps)}
        {metricGroupsFor(family).map(([cat, toks]) => section(cat, toks.map((id) => [id, metricCatalog[id].label, metricCatalog[id].unit])))}
      </div>
    </>
  );
}

// ---- pro-layout gallery bottom sheet: pick a persona-designed page to add to the ride ----
const presetTokenLabel = (tok) => PRESET_TOKEN_LABEL[tok] || metricCatalog[tok]?.label || tok;

function PresetCard({ preset, onApply }) {
  const p = preset.pages[0];
  const extra = preset.pages.length - 1;
  return (
    <div onClick={onApply} style={s('cursor:pointer;display:flex;gap:11px;padding:12px 13px;border-radius:13px;border:1px solid var(--line);background:var(--bg2)')}>
      <div style={s(`width:38px;height:38px;flex:none;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:19px;background:color-mix(in srgb,${preset.accent} 20%,var(--bg3));border:1px solid color-mix(in srgb,${preset.accent} 45%,transparent)`)}>{preset.emoji}</div>
      <div style={s('flex:1;min-width:0')}>
        <div style={s('display:flex;align-items:baseline;gap:8px;flex-wrap:wrap')}>
          <span style={s('font-size:14px;font-weight:700;letter-spacing:-.2px')}>{preset.persona}</span>
          <span className="mono" style={s(`font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${preset.accent}`)}>{preset.tag}</span>
        </div>
        <div style={s('font-size:11.5px;color:var(--text2);line-height:1.35;margin-top:3px')}>{preset.blurb}</div>
        {/* tiny layout preview — the fields this page carries + its arrangement */}
        <div style={s('display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;align-items:center')}>
          <span style={s('font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text3)')}>{p.layout}{p.side === 'group' ? ' · group' : ''}</span>
          {p.fields.slice(0, 6).map((tok, i) => (
            <span key={i} className="mono" style={s('font-size:9.5px;font-weight:600;color:var(--text2);background:var(--bg3);border:1px solid var(--line);border-radius:6px;padding:1px 6px')}>{presetTokenLabel(tok)}</span>
          ))}
          {extra > 0 && <span style={s('font-size:9.5px;color:var(--text3)')}>+{extra} page{extra > 1 ? 's' : ''}</span>}
        </div>
      </div>
    </div>
  );
}

function PresetSheet({ onApply, onClose }) {
  // Same pull-down-to-dismiss behaviour as the field picker.
  const [dragY, setDragY] = useState(0);
  const [touched, setTouched] = useState(false);
  // Add page (append) vs Replace all (swap the whole page-set). Full sets shine in Replace all.
  const [mode, setMode] = useState('add');
  const replace = mode === 'replace';
  const drag = useRef(null);
  const onGrabDown = (e) => { setTouched(true); drag.current = { y: e.clientY, t: e.timeStamp }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no capture */ } };
  const onGrabMove = (e) => { if (drag.current) { const dy = e.clientY - drag.current.y; setDragY(dy > 0 ? dy : 0); } };
  const onGrabUp = (e) => {
    const d = drag.current; if (!d) return;
    const dy = e.clientY - d.y; const flick = dy > 30 && e.timeStamp - d.t < 250;
    drag.current = null;
    if (dy > 90 || flick) onClose(); else setDragY(0);
  };
  const section = (title, items) => (
    <>
      <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:2px 0 7px')}>{title}</div>
      <div style={s('display:flex;flex-direction:column;gap:9px;margin-bottom:16px')}>
        {items.map((preset) => <PresetCard key={preset.id} preset={preset} onApply={() => onApply(preset, replace)} />)}
      </div>
    </>
  );
  return (
    <>
      <div className="ctl" onClick={onClose} style={s(`position:absolute;inset:0;background:rgba(0,0,0,${(0.55 * Math.max(0, 1 - dragY / 400)).toFixed(2)});z-index:50`)} />
      <div className="scr" style={s(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:var(--bg);border-radius:26px 26px 0 0;border-top:1px solid var(--line2);max-height:80%;overflow-y:auto;padding:14px 18px 32px;${dragY ? `transform:translateY(${dragY}px);transition:none` : (touched ? 'transform:translateY(0);transition:transform .22s ease' : 'animation:floatUp .3s ease')}`)}>
        <div onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp} style={s('touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;margin:-14px -18px 0;padding:14px 18px 2px')}>
          <div style={s('width:40px;height:4px;border-radius:3px;background:var(--line2);margin:0 auto 14px')} />
          <div style={s('font-size:17px;font-weight:700;letter-spacing:-.3px')}>Pro layouts</div>
          <div style={s('font-size:11.5px;color:var(--text3);margin:4px 0 11px;line-height:1.4')}>
            {replace
              ? 'Ride-tested designs by discipline. Tap one to replace all your pages with it.'
              : 'Ride-tested designs by discipline. Tap one to add it as new pages — your existing pages stay put.'}
          </div>
        </div>
        {/* Add vs Replace-all mode */}
        <div style={s('display:flex;gap:6px;margin-bottom:16px')}>
          {[['add', 'Add page'], ['replace', 'Replace all']].map(([id, l]) => seg(mode, id, l, () => setMode(id)))}
        </div>
        {section('Full sets', LIVE_PRESET_SETS)}
        {section('Single pages', LIVE_PRESETS)}
      </div>
    </>
  );
}

// ---- the unified full-screen rotating page system ----
export default function LivePages({ tel, lp, uwb, blePeers, indoor = false, mySport, climb }) {
  const { pages, pageIdx, editFields, picker, autoRotate, actions, family, mono } = lp;
  const [presetsOpen, setPresetsOpen] = useState(false);
  const page = pages[pageIdx];
  const side = page.side || 'none';
  const withSide = side !== 'none';
  const count = page.fields.length;
  const cols = count <= 2 ? 1 : 2;
  const big = withSide
    ? (count <= 2 ? 32 : count <= 4 ? 26 : 22)
    : (count <= 2 ? 54 : count <= 3 ? 46 : count <= 4 ? 40 : count <= 6 ? 34 : 28);
  const heroIdx = page.layout === 'hero' ? (page.heroIndex == null ? 0 : page.heroIndex) : -1;

  const mv = liveMetricValues(tel, climb);
  const charts = liveChartsView(tel);

  const fields = page.fields.map((tok, i) => {
    const hero = i === heroIdx;
    const cellStyle = 'position:relative;background:var(--bg2);border:1px solid ' +
      (editFields ? 'color-mix(in srgb,var(--accent) 55%,transparent)' : 'var(--line)') +
      ';border-radius:14px;padding:11px 12px;display:flex;flex-direction:column;overflow:hidden;' +
      'user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;' +
      (editFields ? 'cursor:grab;' : '') + (hero ? 'grid-column:1/-1;' : '');
    const base = {
      cellStyle,
      starBg: hero ? 'var(--accent)' : 'var(--bg3)',
      starFill: hero ? 'var(--accent-ink)' : 'none',
      starStroke: hero ? 'var(--accent-ink)' : 'var(--text2)',
    };
    if (tok === 'map' || tok === 'map+elev') {
      // Real rider positions from the hub (those with a GPS fix). Empty → "Waiting for GPS".
      const riders = (tel?.riders || []).filter((r) => r.lat != null && r.lon != null);
      // Your recorded breadcrumb + the selected course route (each [lat,lon]).
      const path = (tel?.path || []).filter((p) => p && p[0] != null && p[1] != null);
      const course = (tel?.course || []).filter((p) => p && p[0] != null && p[1] != null);
      // Frame the view on everything present so the whole route + pack fit.
      const pts = [...riders.map((r) => [r.lat, r.lon]), ...path, ...course];
      // Phone-to-phone BLE pack-spacing readout, shown only when fusion is live this tick.
      const packGap = tel?.packFused ? (tel?.gap != null ? Math.round(tel.gap) : null) : null;
      // Your position for the elevation "you are here" marker: your rider fix, else the breadcrumb tail.
      const youR = riders.find((r) => r.you);
      const you = youR ? [youR.lat, youR.lon] : (path.length ? path[path.length - 1] : null);
      return { ...base, kind: 'map', label: 'Route', showElev: tok === 'map+elev', riders, path, course, pts, you, packFused: !!tel?.packFused, packGap };
    }
    if (tok === 'elev:track' || tok === 'elev:route') {
      const isRoute = tok === 'elev:route';
      const riders = (tel?.riders || []).filter((r) => r.lat != null && r.lon != null);
      const path = (tel?.path || []).filter((p) => p && p[0] != null && p[1] != null);
      const course = (tel?.course || []).filter((p) => p && p[0] != null && p[1] != null);
      const youR = riders.find((r) => r.you);
      const you = youR ? [youR.lat, youR.lon] : (path.length ? path[path.length - 1] : null);
      return { ...base, kind: 'elev', source: isRoute ? 'route' : 'track', route: isRoute ? course : path, you };
    }
    if (tok === 'climbpro') return { ...base, kind: 'climbpro' };
    if (tok === 'radar') return { ...base, kind: 'radar', radar: liveRadarView(tel) };
    if (tok === 'peloton') return { ...base, kind: 'peloton', v: { ...pelotonView(tel), uwb, blePeers } };
    if (charts[tok]) { const c = charts[tok]; return { ...base, kind: 'chart', label: c.label, value: c.cur, unit: c.unit, color: mono ? '#cdd3db' : c.color, pts: c.pts, area: c.area }; }
    const m = metricCatalog[tok] || { label: tok, unit: '' };
    const val = mv[tok] || { v: '—' };
    const vs = hero ? big + 10 : big;
    // Per-metric accent (top bar + icon); value keeps its own semantic colour when it has one.
    // Monochrome mode flattens both to greys.
    const accent = metricAccent(tok);
    const barColor = mono ? '#c9d0d9' : (accent || 'var(--text3)');
    const color = mono ? '#dfe4ea' : (val.color || accent || 'var(--text)');
    // A small viz for the few metrics where we have real data to show it.
    let viz = null;
    const has = val.v != null && val.v !== '—';
    if (tok === 'grad' && has) { const g = Math.abs(parseFloat(val.v)) || 0; viz = { type: 'wedge', wedgeY: Math.max(1, Math.min(15, 15 - g * 1.3)) }; }
    else if (tok === 'packpos' && /^\d+\/\d+$/.test(String(val.v))) { const [n, total] = String(val.v).split('/').map(Number); viz = { type: 'dots', n, total: Math.min(total, 8) }; }
    else if ((tok === 'battery' || tok === 'di2') && has) { const p = parseFloat(val.v); if (Number.isFinite(p)) viz = { type: 'fill', pct: Math.max(0, Math.min(100, p)) }; }
    // Character-aware sizing so a long value (e.g. a 7-char "2:51:45" timer) fills the tile
    // width without clipping: --vfw is the container-query width cap (shrinks with length),
    // and --vf (the px fallback for browsers without container queries) is reduced too.
    const chars = Math.max(1, String(val.v ?? '').length);
    const vfw = Math.min(hero ? 24 : 30, Math.round((hero ? 105 : 140) / chars));
    const vf = Math.min(vs, Math.round((hero ? 300 : 210) / chars));
    return { ...base, kind: 'metric', hero, label: m.label, unit: m.unit, value: val.v, vf, vfw, color, barColor, icon: metricIcon(tok), viz };
  });

  // Horizontal swipe to change pages (left → next, right → prev). Skipped while
  // editing so drag-to-reorder keeps the pointer. A mostly-horizontal move past the
  // threshold counts; vertical scrolls and taps are ignored.
  const swipe = useRef(null);
  const onRowPointerDown = (e) => {
    // Don't start a page-swipe from the interactive map — a horizontal drag there pans the map,
    // not the pager. Change pages from the swipe strip below the tiles instead.
    if (editFields || (e.target?.closest && e.target.closest('.maplibregl-map'))) { swipe.current = null; return; }
    swipe.current = { x: e.clientX, y: e.clientY };
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

  const isFree = page.layout === 'free';
  const slots = isFree ? ensureSlots(page) : null;
  const freeGridRef = useRef(null);
  const gridStyle = `flex:1;display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;grid-auto-rows:1fr;min-width:0`;
  const freeGridStyle = `flex:1;display:grid;grid-template-columns:repeat(${FREE_COLS},1fr);grid-template-rows:repeat(${FREE_ROWS},1fr);gap:${FREE_GAP}px;min-width:0`;

  return (
    <>
      {/* full-screen page: free 8×20 grid, or the optional Group column + auto grid */}
      <div className="live-row" style={s(`display:flex;gap:9px;padding:0 12px;touch-action:${isFree && editFields ? 'none' : 'pan-y'}`)} onPointerDown={onRowPointerDown} onPointerUp={onRowPointerUp}>
        {isFree ? (
          <div ref={freeGridRef} style={s(freeGridStyle)}>
            {fields.map((f, i) => <FreeTile key={i} f={f} index={i} slot={slots[i]} editing={editFields} actions={actions} indoor={indoor} mySport={mySport} climb={climb} mono={mono} gridRef={freeGridRef} />)}
          </div>
        ) : (
          <>
            {withSide && <GroupColumn tel={tel} />}
            <div style={s(gridStyle)}>
              {fields.map((f, i) => <FieldCell key={i} f={f} index={i} editing={editFields} actions={actions} indoor={indoor} mySport={mySport} climb={climb} mono={mono} />)}
            </div>
          </>
        )}
      </div>

      {/* Bottom pager strip — a dedicated swipe/tap area to change pages. It's the way to switch
          pages on the map page (where a swipe on the tile pans the map, not the pager). */}
      {!editFields && pages.length > 1 && (
        <div style={s('flex:none;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 12px 2px;touch-action:pan-y')}
          onPointerDown={onRowPointerDown} onPointerUp={onRowPointerUp}>
          <div style={s('display:flex;align-items:center;gap:6px')}>
            {page.pro && <span style={s('font-size:8px;font-weight:800;letter-spacing:.7px;color:var(--accent-ink);background:var(--accent);border-radius:5px;padding:1px 5px')}>PRO</span>}
            <span style={s('font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--text3)')}>{page.name} · swipe to change</span>
          </div>
          <div style={s('display:flex;gap:7px;align-items:center')}>
            {pages.map((p, i) => (
              <div key={i} onClick={() => actions.goPage(i)} style={s(`width:8px;height:8px;border-radius:50%;cursor:pointer;transition:all .15s;${i === pageIdx ? 'background:var(--accent);transform:scale(1.35)' : 'background:var(--line2)'}${p.pro && i !== pageIdx ? ';box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 45%,transparent)' : ''}`)} />
            ))}
          </div>
        </div>
      )}

      {editFields && <EditPanel page={page} actions={actions} mono={mono} family={family} onOpenPresets={() => setPresetsOpen(true)} />}

      {/* Pager dock — edit-only. During a ride the page is changed by horizontal swipe (or
          Auto-rotate) and edit is entered by long-pressing a tile, so the dock stays out of
          the way; it reappears here with its full controls once editing. */}
      {editFields && (
      <div style={s('position:absolute;left:12px;right:12px;bottom:100px;z-index:34;display:flex;align-items:center;gap:9px;background:color-mix(in srgb,var(--bg2) 92%,transparent);backdrop-filter:blur(14px);border:1px solid var(--line);border-radius:16px;padding:9px 11px;box-shadow:0 10px 26px -12px rgba(0,0,0,.6);animation:floatUp .25s ease')}>
        <div className="ctl" onClick={actions.prevPage} style={s('width:30px;height:30px;border-radius:9px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
        </div>
        <div style={s('flex:1;text-align:center;min-width:0')}>
          <div style={s('display:flex;align-items:center;justify-content:center;gap:6px;min-width:0')}>
            {page.pro && <span style={s('font-size:8px;font-weight:800;letter-spacing:.7px;color:var(--accent-ink);background:var(--accent);border-radius:5px;padding:1px 5px;flex:none')}>PRO</span>}
            <span style={s('font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{page.name}</span>
          </div>
          <div style={s('display:flex;gap:6px;justify-content:center;margin-top:5px')}>
            {pages.map((p, i) => (
              <div key={i} onClick={() => actions.goPage(i)} style={s(`width:8px;height:8px;border-radius:50%;cursor:pointer;transition:all .15s;${i === pageIdx ? 'background:var(--accent);transform:scale(1.4)' : 'background:var(--line2)'}${p.pro && i !== pageIdx ? ';box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 45%,transparent)' : ''}`)} />
            ))}
          </div>
        </div>
        <div className="ctl" onClick={actions.toggleAutoRotate} style={s(`font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:6px 8px;border-radius:9px;flex:none;${autoRotate ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'}`)}>Auto</div>
        <div className="ctl" onClick={actions.toggleEdit} style={s(`font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:6px 8px;border-radius:9px;flex:none;${editFields ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'}`)}>{editFields ? 'Done' : 'Edit'}</div>
        <div className="ctl" onClick={actions.nextPage} style={s('width:30px;height:30px;border-radius:9px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
        </div>
      </div>
      )}

      {picker.open && <PickerSheet page={page} slot={picker.slot} actions={actions} family={family} />}

      {presetsOpen && <PresetSheet onClose={() => setPresetsOpen(false)} onApply={(preset, replace) => { actions.applyPreset(preset, { replace }); setPresetsOpen(false); }} />}
    </>
  );
}
