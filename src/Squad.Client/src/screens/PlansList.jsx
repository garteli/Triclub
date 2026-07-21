import { useCallback, useEffect, useState } from 'react';
import { s } from '../lib/style.js';

// A coach's saved training plans. Create a new one, open one to edit, or delete.
// Data comes from the `plans` ops object (list/open/create/remove), backed by
// /api/plan/plans. Signed-out / non-coach users just see the empty state.

const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function PlansList({ plans, actions }) {
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null); // plan pending delete-confirmation

  const load = useCallback(async () => {
    if (!plans?.list) { setItems([]); return; }
    setError('');
    try {
      const list = await plans.list();
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || 'Could not load plans.');
      setItems([]);
    }
  }, [plans]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    if (!plans?.remove) return;
    setBusyId(id);
    setError('');
    try {
      await plans.remove(id);
      setItems((xs) => (xs || []).filter((p) => p.id !== id));
      setConfirmId(null);
    } catch (e) {
      setError(e?.message || 'Could not delete plan.');
      setConfirmId(null);
    } finally {
      setBusyId(null);
    }
  };

  const pendingPlan = confirmId ? (items || []).find((p) => p.id === confirmId) : null;
  const deleting = busyId === confirmId;

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* title + back now in the global app header */}

      {/* browse the library (primary) — a ready-made plan for your race + goal */}
      <div className="ctl" onClick={() => actions.go('planlibrary')} style={s('display:flex;align-items:center;gap:12px;background:var(--accent);color:var(--accent-ink);border-radius:16px;padding:15px 16px;font-weight:700;font-size:14.5px;margin-top:16px')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
        <div style={s('flex:1;min-width:0')}>
          <div>Browse the plan library</div>
          <div style={s('font-size:11.5px;font-weight:600;opacity:.75;margin-top:1px')}>Ready-made plans for your race & goal time</div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </div>

      {/* new (blank) plan */}
      <div className="ctl" onClick={() => plans?.create?.()} style={s('display:flex;align-items:center;justify-content:center;gap:8px;background:var(--bg2);border:1px solid var(--line);color:var(--text);border-radius:14px;padding:12px 14px;font-weight:700;font-size:13.5px;margin-top:10px')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>New blank plan
      </div>

      {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-top:12px')}>{error}</div>}

      {/* list */}
      {items === null ? (
        <div style={s('text-align:center;font-size:12.5px;color:var(--text3);margin-top:26px')}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:22px;text-align:center;margin-top:16px')}>
          <div style={s('font-size:14px;font-weight:700')}>No plans yet</div>
          <div style={s('font-size:12.5px;color:var(--text3);line-height:1.5;margin-top:5px')}>Create a plan to build a multi-week block and publish it to your squad.</div>
        </div>
      ) : (
        <div style={s('display:flex;flex-direction:column;gap:10px;margin-top:16px')}>
          {items.map((p) => (
            <div key={p.id} style={s('display:flex;align-items:center;gap:10px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px')}>
              <div className="ctl" onClick={() => plans?.open?.(p.id)} style={s('flex:1;min-width:0')}>
                <div style={s('font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{p.name || 'Untitled plan'}</div>
                <div style={s('font-size:11px;color:var(--text3);margin-top:2px')}>Updated {fmtWhen(p.updatedUtc)}</div>
              </div>
              <div className="ctl" onClick={() => plans?.open?.(p.id)} style={s('width:32px;height:32px;border-radius:9px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text2);flex:none')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
              </div>
              <div className={busyId === p.id ? undefined : 'ctl'} onClick={busyId === p.id ? undefined : () => setConfirmId(p.id)} style={s('width:32px;height:32px;border-radius:9px;background:color-mix(in srgb,var(--bad) 12%,var(--bg3));border:1px solid color-mix(in srgb,var(--bad) 30%,transparent);display:flex;align-items:center;justify-content:center;color:var(--bad);flex:none;' + (busyId === p.id ? 'opacity:.5' : ''))}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* delete-plan confirmation — deleting a saved plan can't be undone */}
      {pendingPlan && (
        <>
          <div className="ctl" onClick={deleting ? undefined : () => setConfirmId(null)} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
          <div className="scr" style={s('position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(90%,420px);z-index:51;background:var(--bg);border:1px solid var(--line2);border-radius:20px;padding:20px;animation:floatUpCenter .25s ease')}>
            <div style={s('font-size:17px;font-weight:700')}>Delete this plan?</div>
            <div style={s('font-size:13px;color:var(--text2);line-height:1.5;margin-top:8px')}>
              <span style={s('color:var(--text);font-weight:600')}>{pendingPlan.name || 'Untitled plan'}</span> will be permanently deleted. This can’t be undone.
            </div>
            <div style={s('display:flex;gap:10px;margin-top:18px')}>
              <div className="ctl" onClick={deleting ? undefined : () => setConfirmId(null)} style={s(`flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bg3);border:1px solid var(--line);color:var(--text2);opacity:${deleting ? 0.5 : 1}`)}>Cancel</div>
              <div className="ctl" onClick={deleting ? undefined : () => remove(pendingPlan.id)} style={s(`flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bad);color:#fff;opacity:${deleting ? 0.7 : 1}`)}>{deleting ? 'Deleting…' : 'Delete'}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
