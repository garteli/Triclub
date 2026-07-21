import { useCallback, useEffect, useMemo, useState } from 'react';
import { s } from '../lib/style.js';

// Browse the pre-built plan library: pick a race distance, then a goal-time level,
// preview the weeks, and adopt it (with your start/target date) into your own plans.
// Data comes from the `plans` ops object (library/libraryTemplate/adopt/open), backed
// by /api/plan/library. Shows only what's been generated — empty until the library fills.

// Display order + short labels for the distance chips.
const DISTANCES = [
  ['5K', '5K'], ['10K', '10K'], ['Half Marathon', 'Half'],
  ['Marathon', 'Marathon'], ['70.3', '70.3'], ['140.6', '140.6'],
];

const parseDoc = (doc) => {
  try { return typeof doc === 'string' ? JSON.parse(doc) : doc; } catch { return null; }
};

// Sport → accent colour (matches the editor palette).
const SPORT_COLOR = { Bike: 'var(--bike)', Swim: 'var(--swim)', Run: 'var(--run)', Gym: '#c68bff', Rest: 'var(--text3)' };

// ── Preview + adopt bottom sheet ──────────────────────────────────────────────
function PreviewSheet({ template, onClose, onAdopt }) {
  const [anchorType, setAnchorType] = useState('start'); // 'start' | 'target'
  const [anchorDate, setAnchorDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const doc = useMemo(() => parseDoc(template?.doc), [template]);
  const weeks = doc?.weeks || {};
  const weekNums = Object.keys(weeks).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);

  const adopt = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await onAdopt({ anchorType, anchorDate: anchorDate || undefined });
    } catch (e) {
      setError(e?.message || 'Could not add this plan.');
      setBusy(false);
    }
  };

  return (
    <>
      <div className="ctl" onClick={busy ? undefined : onClose} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
      <div style={s('position:fixed;left:0;right:0;bottom:0;z-index:51;display:flex;justify-content:center;pointer-events:none')}>
        <div className="scr" style={s('width:100%;max-width:480px;pointer-events:auto;background:var(--bg);border-radius:24px 24px 0 0;border-top:1px solid var(--line2);max-height:90dvh;overflow-y:auto;padding:14px 18px 28px;animation:floatUp .3s ease')}>
          <div style={s('width:40px;height:4px;border-radius:3px;background:var(--line2);margin:0 auto 14px')} />
          <div style={s('display:flex;align-items:flex-start;justify-content:space-between;gap:10px')}>
            <div style={s('min-width:0')}>
              <div style={s('font-size:18px;font-weight:700;line-height:1.25')}>{template.name}</div>
              <div style={s('font-size:12px;color:var(--text3);margin-top:3px')}>{template.distance} · {template.goalLabel} · {template.weeks} weeks</div>
            </div>
            <div className="ctl" onClick={onClose} style={s('font-size:13px;color:var(--text2);font-weight:600;flex:none')}>Close</div>
          </div>

          {/* week-by-week summary */}
          <div style={s('margin-top:16px;display:flex;flex-direction:column;gap:8px')}>
            {weekNums.length === 0 && <div style={s('font-size:12.5px;color:var(--text3)')}>Preview unavailable.</div>}
            {weekNums.map((n) => {
              const w = weeks[String(n)] || {};
              const sessions = w.sessions || {};
              const sportDots = [];
              Object.values(sessions).forEach((arr) => (arr || []).forEach((x) => sportDots.push(x.sport)));
              const count = sportDots.filter((sp) => sp !== 'Rest').length;
              return (
                <div key={n} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:11px 13px')}>
                  <div style={s('display:flex;align-items:center;gap:8px')}>
                    <div style={s('font-size:10px;font-weight:700;color:var(--text3);width:44px;flex:none')}>WK {n}</div>
                    <div style={s('font-size:13.5px;font-weight:700;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{w.title || `Week ${n}`}</div>
                    {w.targetHrs ? <div style={s('font-size:11px;color:var(--text2);flex:none')}>{w.targetHrs} h</div> : null}
                  </div>
                  {w.focus ? <div style={s('font-size:11.5px;color:var(--text3);margin-top:3px;line-height:1.4')}>{w.focus}</div> : null}
                  <div style={s('display:flex;gap:4px;margin-top:8px;flex-wrap:wrap')}>
                    {sportDots.map((sp, i) => (
                      <span key={i} title={sp} style={s(`width:8px;height:8px;border-radius:50%;background:${SPORT_COLOR[sp] || 'var(--text3)'}`)} />
                    ))}
                    <span style={s('font-size:10.5px;color:var(--text3);margin-left:4px')}>{count} session{count === 1 ? '' : 's'}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* adopt controls */}
          <div style={s('margin-top:18px;padding-top:16px;border-top:1px solid var(--line)')}>
            <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:7px')}>This date is the plan's…</div>
            <div style={s('display:flex;gap:8px')}>
              {[['start', 'Start date'], ['target', 'Race / target day']].map(([v, label]) => (
                <div key={v} className="ctl" onClick={busy ? undefined : () => setAnchorType(v)}
                  style={s('flex:1;text-align:center;padding:10px 6px;border-radius:11px;font-size:12.5px;font-weight:700;' +
                    (anchorType === v ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'))}>
                  {label}
                </div>
              ))}
            </div>
            <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)}
              style={s('width:100%;margin-top:10px;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
            <div style={s('font-size:11px;color:var(--text3);margin-top:6px')}>Optional — you can set dates later in the editor.</div>

            {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-top:12px')}>{error}</div>}

            <div className="ctl" onClick={adopt} style={s(`margin-top:16px;text-align:center;padding:14px;border-radius:13px;font-weight:700;font-size:14.5px;background:var(--accent);color:var(--accent-ink);opacity:${busy ? 0.7 : 1}`)}>
              {busy ? 'Adding…' : 'Add to my plans'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function PlanLibrary({ plans, actions }) {
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [distance, setDistance] = useState(null);
  const [preview, setPreview] = useState(null); // loaded template { id, name, doc, ... }
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    if (!plans?.library) { setItems([]); return; }
    setError('');
    try {
      const list = await plans.library();
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || 'Could not load the library.');
      setItems([]);
    }
  }, [plans]);

  useEffect(() => { load(); }, [load]);

  // Distances that actually have plans, in display order.
  const available = useMemo(() => {
    const present = new Set((items || []).map((t) => t.distance));
    return DISTANCES.filter(([key]) => present.has(key));
  }, [items]);

  // Default to the first available distance once loaded.
  useEffect(() => {
    if (distance == null && available.length) setDistance(available[0][0]);
  }, [available, distance]);

  const shown = useMemo(
    () => (items || []).filter((t) => t.distance === distance).sort((a, b) => a.sortOrder - b.sortOrder),
    [items, distance],
  );

  const openPreview = async (id) => {
    setError('');
    try {
      const t = await plans.libraryTemplate(id);
      setPreview(t);
    } catch (e) {
      setError(e?.message || 'Could not open that plan.');
    }
  };

  const adopt = async (opts) => {
    if (opening) return;
    setOpening(true);
    const res = await plans.adopt(preview.id, opts); // throws → PreviewSheet shows the error
    setPreview(null);
    setOpening(false);
    // Open the freshly-adopted plan in the editor.
    if (res?.id) plans.open(res.id); else actions.go('plans');
  };

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* title + back are in the global app header */}

      {items === null ? (
        <div style={s('text-align:center;font-size:12.5px;color:var(--text3);margin-top:26px')}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:22px;text-align:center;margin-top:16px')}>
          <div style={s('font-size:14px;font-weight:700')}>Library is being prepared</div>
          <div style={s('font-size:12.5px;color:var(--text3);line-height:1.5;margin-top:5px')}>Ready-made plans are still generating. Check back shortly.</div>
          {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-top:10px')}>{error}</div>}
        </div>
      ) : (
        <>
          <div style={s('font-size:12.5px;color:var(--text2);margin-top:6px;line-height:1.5')}>Pick your race, then a goal time. Preview the weeks and add it to your plans.</div>

          {/* distance chips */}
          <div className="hscroll" style={s('display:flex;gap:8px;margin-top:14px;overflow-x:auto;padding-bottom:2px')}>
            {available.map(([key, label]) => (
              <div key={key} className="ctl" onClick={() => setDistance(key)}
                style={s('flex:none;padding:9px 15px;border-radius:11px;font-size:13px;font-weight:700;' +
                  (distance === key ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg2);border:1px solid var(--line);color:var(--text2)'))}>
                {label}
              </div>
            ))}
          </div>

          {/* level cards for the selected distance */}
          <div style={s('display:flex;flex-direction:column;gap:10px;margin-top:16px')}>
            {shown.map((t) => (
              <div key={t.id} className="ctl" onClick={() => openPreview(t.id)}
                style={s('display:flex;align-items:center;gap:12px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px 15px')}>
                <div style={s('flex:1;min-width:0')}>
                  <div style={s('font-size:15px;font-weight:700')}>{t.goalLabel}</div>
                  <div style={s('font-size:11.5px;color:var(--text3);margin-top:2px')}>{t.weeks}-week plan</div>
                </div>
                <div style={s('font-size:11px;font-weight:700;color:var(--accent-ink);background:var(--accent);border-radius:9px;padding:7px 11px;flex:none')}>Preview</div>
              </div>
            ))}
            {shown.length === 0 && <div style={s('font-size:12.5px;color:var(--text3);text-align:center;margin-top:10px')}>No plans for this distance yet.</div>}
          </div>

          {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-top:12px')}>{error}</div>}
        </>
      )}

      {preview && <PreviewSheet template={preview} onClose={() => setPreview(null)} onAdopt={adopt} />}
    </div>
  );
}
