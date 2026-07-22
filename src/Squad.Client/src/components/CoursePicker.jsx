import { useCallback, useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { parseGpx, courseNameFromPoints } from '../lib/courses.js';
import { haversineMeters } from '../lib/geo.js';
import CourseDraw from './CourseDraw.jsx';

// Pick a saved route to follow on the live map, save the ride you just recorded as a course,
// or import a GPX. `courses` is the ops object from App (list/select/clear/save/remove/ridePath/selected).
//
// Reused by the event editor as a plain route picker: pass `title` to relabel the sheet and
// `allowSaveRide={false}` to hide "Save last ride" (there's no recorded ride to save there) —
// select-existing / import-GPX / draw-on-map still work.

const distKm = (pts) => {
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += haversineMeters({ lat: pts[i - 1][0], lon: pts[i - 1][1] }, { lat: pts[i][0], lon: pts[i][1] });
  return m / 1000;
};

export default function CoursePicker({ courses, onClose, title = 'Course for this ride', allowSaveRide = true }) {
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(null); // { source:'ride'|'gpx', points, name }
  const [drawing, setDrawing] = useState(false); // draw-on-map overlay open
  const gpxRef = useRef(null);

  const selectedId = courses?.selected?.id ?? null;

  const load = useCallback(async () => {
    if (!courses?.list) { setItems([]); return; }
    setError('');
    try { setItems(await courses.list()); } catch (e) { setError(e?.message || 'Could not load courses.'); setItems([]); }
  }, [courses]);
  useEffect(() => { load(); }, [load]);

  const choose = async (id) => {
    setBusy(true); setError('');
    try { await courses.select(id); } catch (e) { setError(e?.message || 'Could not load that course.'); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    setBusy(true); setError('');
    try { await courses.remove(id); if (selectedId === id) courses.clear(); setItems((xs) => (xs || []).filter((c) => c.id !== id)); }
    catch (e) { setError(e?.message || 'Could not delete.'); }
    finally { setBusy(false); }
  };

  const startSaveRide = () => {
    const pts = courses.ridePath?.() || [];
    if (pts.length < 2) { setError('No ride recorded yet to save as a course.'); return; }
    setNaming({ source: 'ride', points: pts, name: courseNameFromPoints(pts) });
  };

  const onGpx = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try {
      const pts = parseGpx(await file.text());
      if (pts.length < 2) { setError('No track points found in that GPX.'); return; }
      setNaming({ source: 'gpx', points: pts, name: file.name.replace(/\.gpx$/i, '') });
    } catch { setError('Could not read that GPX file.'); }
  };

  const confirmSave = async () => {
    if (!naming || busy) return;
    setBusy(true); setError('');
    try {
      const km = distKm(naming.points);
      const created = await courses.save((naming.name || 'Course').trim(), naming.points, km || null);
      setNaming(null);
      await load();
      if (created?.id) await courses.select(created.id); // follow the freshly-saved course
    } catch (e) { setError(e?.message || 'Could not save the course.'); }
    finally { setBusy(false); }
  };

  // Save a course drawn on the map, then follow it (the CourseDraw overlay owns its own busy/error UI).
  const saveDrawn = async (name, points, km) => {
    const created = await courses.save(name, points, km);
    setDrawing(false);
    await load();
    if (created?.id) await courses.select(created.id);
  };

  return (
    <>
      <div className="ctl" onClick={busy ? undefined : onClose} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
      <div style={s('position:fixed;left:0;right:0;bottom:0;z-index:51;display:flex;justify-content:center;pointer-events:none')}>
        <div className="scr" style={s('width:100%;max-width:480px;pointer-events:auto;background:var(--bg);border-radius:24px 24px 0 0;border-top:1px solid var(--line2);max-height:86dvh;overflow-y:auto;padding:14px 18px 28px;animation:floatUp .3s ease')}>
          <div style={s('width:40px;height:4px;border-radius:3px;background:var(--line2);margin:0 auto 14px')} />
          <div style={s('display:flex;align-items:center;justify-content:space-between')}>
            <div style={s('font-size:18px;font-weight:700')}>{title}</div>
            <div className="ctl" onClick={onClose} style={s('font-size:13px;color:var(--text2);font-weight:600')}>Close</div>
          </div>

          {naming ? (
            <div style={s('margin-top:16px')}>
              <div style={s('font-size:12px;color:var(--text3);margin-bottom:7px')}>Name this course ({naming.points.length} points · {distKm(naming.points).toFixed(1)} km)</div>
              <input value={naming.name} onChange={(e) => setNaming((n) => ({ ...n, name: e.target.value }))} placeholder="Course name"
                style={s('width:100%;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
              {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-top:10px')}>{error}</div>}
              <div style={s('display:flex;gap:10px;margin-top:16px')}>
                <div className="ctl" onClick={busy ? undefined : () => setNaming(null)} style={s('flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>Cancel</div>
                <div className="ctl" onClick={confirmSave} style={s(`flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--accent);color:var(--accent-ink);opacity:${busy ? 0.7 : 1}`)}>{busy ? 'Saving…' : 'Save course'}</div>
              </div>
            </div>
          ) : (
            <>
              {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-top:12px')}>{error}</div>}

              {/* None option */}
              <div className="ctl" onClick={() => choose(null)} style={s('display:flex;align-items:center;gap:10px;background:var(--bg2);border:1px solid ' + (selectedId ? 'var(--line)' : 'var(--accent)') + ';border-radius:13px;padding:12px 14px;margin-top:14px')}>
                <div style={s('flex:1;font-size:14px;font-weight:700;color:' + (selectedId ? 'var(--text2)' : 'var(--text)'))}>No course</div>
                {!selectedId && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
              </div>

              {items === null ? (
                <div style={s('text-align:center;font-size:12.5px;color:var(--text3);margin-top:16px')}>Loading…</div>
              ) : (
                <div style={s('display:flex;flex-direction:column;gap:9px;margin-top:9px')}>
                  {items.map((c) => (
                    <div key={c.id} style={s('display:flex;align-items:center;gap:10px;background:var(--bg2);border:1px solid ' + (selectedId === c.id ? 'var(--accent)' : 'var(--line)') + ';border-radius:13px;padding:12px 14px')}>
                      <div className="ctl" onClick={() => choose(c.id)} style={s('flex:1;min-width:0')}>
                        <div style={s('font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{c.name}</div>
                        <div style={s('font-size:11px;color:var(--text3);margin-top:2px')}>{c.distanceKm != null ? `${c.distanceKm.toFixed(1)} km · ` : ''}{c.pointCount} pts</div>
                      </div>
                      {selectedId === c.id && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                      <div className="ctl" onClick={() => remove(c.id)} style={s('width:32px;height:32px;border-radius:9px;background:color-mix(in srgb,var(--bad) 12%,var(--bg3));border:1px solid color-mix(in srgb,var(--bad) 30%,transparent);color:var(--bad);flex:none;display:flex;align-items:center;justify-content:center')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <div style={s('font-size:12.5px;color:var(--text3);text-align:center;padding:10px')}>No saved courses yet.</div>}
                </div>
              )}

              {/* create */}
              <div style={s('display:flex;gap:10px;margin-top:16px')}>
                {allowSaveRide && (
                  <div className="ctl" onClick={startSaveRide} style={s('flex:1;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--bg2);border:1px solid var(--line);color:var(--text);border-radius:13px;padding:12px;font-weight:700;font-size:13px')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>Save last ride
                  </div>
                )}
                <div className="ctl" onClick={() => gpxRef.current?.click()} style={s('flex:1;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--bg2);border:1px solid var(--line);color:var(--text);border-radius:13px;padding:12px;font-weight:700;font-size:13px')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M21 21H3" /></svg>Import GPX
                </div>
                <input ref={gpxRef} type="file" accept=".gpx,application/gpx+xml,text/xml" style={s('display:none')} onChange={onGpx} />
              </div>
              <div className="ctl" onClick={() => { setError(''); setDrawing(true); }} style={s('display:flex;align-items:center;justify-content:center;gap:7px;background:var(--bg2);border:1px solid var(--line);color:var(--text);border-radius:13px;padding:12px;font-weight:700;font-size:13px;margin-top:10px')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>Draw on map
              </div>
            </>
          )}
        </div>
      </div>

      {drawing && (
        <CourseDraw
          onCancel={() => setDrawing(false)}
          onSave={saveDrawn}
          initialCenter={courses?.ridePath?.()?.[0] || courses?.selected?.points?.[0]} />
      )}
    </>
  );
}
