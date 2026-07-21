import { useCallback, useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import { listSquadTargets, addSquadTarget, removeSquadTarget, adoptTargetAsGoal } from '../lib/squads.js';

// Group target races for a squad. Two modes:
//   mode="manage"  — the coach adds a target from an event link (AI extracts it) and removes targets.
//   mode="adopt"   — members browse the targets and add one to their own goal race.
// Shared so the Manage screen and the Group page render the same list consistently.

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const daysToGo = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
};

export default function GroupTargets({ squadId, getToken, mode = 'adopt' }) {
  const manage = mode === 'manage';
  const [items, setItems] = useState(null); // null = loading
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [adoptedId, setAdoptedId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!squadId) { setItems([]); return; }
    try { const t = await getToken?.(); setItems(await listSquadTargets(t, squadId)); }
    catch { setItems([]); }
  }, [squadId, getToken]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const u = url.trim();
    if (!u || adding) return;
    setAdding(true); setError('');
    try {
      const t = await getToken?.();
      const created = await addSquadTarget(t, squadId, { url: u });
      setItems((xs) => [...(xs || []), created]);
      setUrl('');
    } catch (e) { setError(e?.message || 'Could not add that target.'); }
    finally { setAdding(false); }
  };

  const remove = async (id) => {
    setBusyId(id); setError('');
    try { const t = await getToken?.(); await removeSquadTarget(t, squadId, id); setItems((xs) => (xs || []).filter((x) => x.id !== id)); }
    catch (e) { setError(e?.message || 'Could not remove that target.'); }
    finally { setBusyId(null); }
  };

  const adopt = async (target) => {
    setBusyId(target.id); setError('');
    try { const t = await getToken?.(); await adoptTargetAsGoal(t, target); setAdoptedId(target.id); }
    catch (e) { setError(e?.message || 'Could not add to your targets.'); }
    finally { setBusyId(null); }
  };

  if (items === null) return null;                 // loading — avoid flicker
  if (!manage && items.length === 0) return null;  // members: hide an empty section

  return (
    <div style={s('margin-top:16px')}>
      <div style={s('font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text2);margin:0 2px 10px')}>Group targets</div>

      {/* manager: add a target from an event link */}
      {manage && (
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px;margin-bottom:10px')}>
          <div style={s('font-size:11px;color:var(--text3);margin-bottom:7px')}>Paste an event link — the AI reads the race name, date &amp; location.</div>
          <div style={s('display:flex;gap:8px')}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…event page"
              style={s('flex:1;min-width:0;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:11px 12px;font-size:13px;color:var(--text);outline:none;font-family:inherit')} />
            <div className={adding || !url.trim() ? undefined : 'ctl'} onClick={adding || !url.trim() ? undefined : add}
              style={s(`flex:none;padding:11px 16px;border-radius:11px;font-weight:700;font-size:13px;background:var(--accent);color:var(--accent-ink);opacity:${adding || !url.trim() ? 0.5 : 1}`)}>
              {adding ? 'Reading…' : 'Add'}
            </div>
          </div>
        </div>
      )}

      {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-bottom:10px')}>{error}</div>}

      {items.length === 0 ? (
        manage && <div style={s('font-size:12.5px;color:var(--text3);background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:14px;text-align:center')}>No group targets yet — add your club's key races above.</div>
      ) : (
        <div style={s('display:flex;flex-direction:column;gap:9px')}>
          {items.map((t) => {
            const dtg = daysToGo(t.date);
            const adopted = adoptedId === t.id;
            return (
              <div key={t.id} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px;display:flex;align-items:center;gap:11px')}>
                <div style={s('width:38px;height:38px;border-radius:11px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--accent-dim);color:var(--accent)')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V4a1 1 0 0 1 1-1h13l-2 4 2 4H6" /></svg>
                </div>
                <div style={s('flex:1;min-width:0')}>
                  <div style={s('font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{t.name}</div>
                  <div style={s('font-size:11.5px;color:var(--text3);margin-top:2px')}>
                    {[fmtDate(t.date), t.location].filter(Boolean).join(' · ') || 'Details on the event page'}
                    {dtg != null && dtg >= 0 ? <span style={s('color:var(--accent);font-weight:700')}>{`  ·  ${dtg}d to go`}</span> : null}
                  </div>
                </div>
                {manage ? (
                  <div className={busyId === t.id ? undefined : 'ctl'} onClick={busyId === t.id ? undefined : () => remove(t.id)}
                    style={s('width:34px;height:34px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bad) 12%,var(--bg3));border:1px solid color-mix(in srgb,var(--bad) 30%,transparent);color:var(--bad)')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
                  </div>
                ) : adopted ? (
                  <div style={s('flex:none;display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:var(--good)')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>Added
                  </div>
                ) : (
                  <div className={busyId === t.id ? undefined : 'ctl'} onClick={busyId === t.id ? undefined : () => adopt(t)}
                    style={s(`flex:none;padding:9px 12px;border-radius:10px;font-weight:700;font-size:12px;background:var(--accent);color:var(--accent-ink);opacity:${busyId === t.id ? 0.6 : 1}`)}>
                    {busyId === t.id ? '…' : 'Add to mine'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
