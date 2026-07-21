import { useCallback, useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';

// A coach's saved training plans. Create a new one, open one to edit, or delete.
// Data comes from the `plans` ops object (list/open/create/remove), backed by
// /api/plan/plans. Signed-out / non-coach users just see the empty state.

const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// The honest, ordered steps of a PDF import — rotated as the (single, opaque) request
// runs so the modal shows real progress through the pipeline, not a fabricated %.
const IMPORT_STEPS = [
  'Uploading your PDF…',
  'The AI is reading the plan…',
  'Laying out weeks and sessions…',
  'Saving your new plan…',
];

// ── Import-from-PDF modal ─────────────────────────────────────────────────────
// phase: 'form' (pick file + dates) → 'working' (indeterminate bar) → 'done' | 'error'.
function ImportModal({ plans, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [anchorType, setAnchorType] = useState('start'); // 'start' | 'target'
  const [anchorDate, setAnchorDate] = useState('');
  const [phase, setPhase] = useState('form');
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { id, name }
  const fileRef = useRef(null);

  // Advance the step label while the request is in flight (stops one short of "done").
  useEffect(() => {
    if (phase !== 'working') return undefined;
    setStepIdx(0);
    const t = setInterval(
      () => setStepIdx((i) => Math.min(i + 1, IMPORT_STEPS.length - 1)),
      1600,
    );
    return () => clearInterval(t);
  }, [phase]);

  const busy = phase === 'working';

  const start = async () => {
    if (!file || busy) return;
    if (!plans?.importPdf) { setError('Sign in as a coach to import.'); setPhase('error'); return; }
    setError('');
    setPhase('working');
    try {
      const res = await plans.importPdf(file, { anchorType, anchorDate: anchorDate || undefined });
      setResult(res);
      setStepIdx(IMPORT_STEPS.length - 1);
      setPhase('done');
    } catch (e) {
      setError(e?.message || 'Could not import that PDF.');
      setPhase('error');
    }
  };

  const pickField = (label, active, onClick) => (
    <div className="ctl" onClick={busy ? undefined : onClick}
      style={s('flex:1;text-align:center;padding:10px 6px;border-radius:11px;font-size:12.5px;font-weight:700;' +
        (active ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'))}>
      {label}
    </div>
  );

  return (
    <>
      <div className="ctl" onClick={busy ? undefined : onClose}
        style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
      <div className="scr" style={s('position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92%,440px);z-index:51;background:var(--bg);border:1px solid var(--line2);border-radius:20px;padding:20px;animation:floatUpCenter .25s ease')}>
        {/* header */}
        <div style={s('display:flex;align-items:center;gap:10px')}>
          <div style={s('width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,var(--accent) 18%,var(--bg2));display:flex;align-items:center;justify-content:center;flex:none;color:var(--accent)')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
          </div>
          <div style={s('flex:1;min-width:0')}>
            <div style={s('font-size:17px;font-weight:700')}>Import a plan from PDF</div>
            <div style={s('font-size:11.5px;color:var(--text3);margin-top:1px')}>AI reads the PDF and builds an editable plan.</div>
          </div>
        </div>

        {/* ── form ── */}
        {(phase === 'form' || phase === 'error') && (
          <>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={s('display:none')}
              onChange={(e) => { setFile(e.target.files?.[0] || null); setError(''); if (phase === 'error') setPhase('form'); }} />
            <div className="ctl" onClick={() => fileRef.current?.click()}
              style={s('margin-top:16px;display:flex;align-items:center;gap:10px;background:var(--bg2);border:1px dashed var(--line2);border-radius:13px;padding:14px 15px')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
              <div style={s('flex:1;min-width:0')}>
                <div style={s('font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:' + (file ? 'var(--text)' : 'var(--text2)'))}>
                  {file ? file.name : 'Choose a PDF file'}
                </div>
                <div style={s('font-size:11px;color:var(--text3);margin-top:1px')}>{file ? 'Tap to choose a different file' : 'Up to 15 MB'}</div>
              </div>
            </div>

            <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:16px 0 7px')}>This date is the plan's…</div>
            <div style={s('display:flex;gap:8px')}>
              {pickField('Start date', anchorType === 'start', () => setAnchorType('start'))}
              {pickField('Race / target day', anchorType === 'target', () => setAnchorType('target'))}
            </div>

            <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:14px 0 7px')}>
              {anchorType === 'target' ? 'Race / target date' : 'Start date'} <span style={s('color:var(--text3);text-transform:none;letter-spacing:0;font-weight:500')}>· optional</span>
            </div>
            <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)}
              style={s('width:100%;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />

            {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-top:12px')}>{error}</div>}

            <div style={s('display:flex;gap:10px;margin-top:18px')}>
              <div className="ctl" onClick={onClose} style={s('flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>Cancel</div>
              <div className={file ? 'ctl' : undefined} onClick={file ? start : undefined}
                style={s(`flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--accent);color:var(--accent-ink);opacity:${file ? 1 : 0.5}`)}>
                Import plan
              </div>
            </div>
          </>
        )}

        {/* ── working (indeterminate) ── */}
        {phase === 'working' && (
          <div style={s('margin-top:20px')}>
            <div style={s('font-size:13.5px;font-weight:600;color:var(--text)')}>{IMPORT_STEPS[stepIdx]}</div>
            <div style={s('font-size:11.5px;color:var(--text3);margin-top:3px')}>This can take a couple of minutes for a long plan — keep this open.</div>
            <div style={s('position:relative;height:6px;border-radius:4px;background:var(--bg3);overflow:hidden;margin-top:14px')}>
              <div style={s('position:absolute;top:0;left:0;height:100%;width:30%;border-radius:4px;background:var(--accent);animation:indet 1.1s ease-in-out infinite')} />
            </div>
          </div>
        )}

        {/* ── done ── */}
        {phase === 'done' && (
          <div style={s('margin-top:18px')}>
            <div style={s('display:flex;align-items:center;gap:10px;background:color-mix(in srgb,var(--good,#4fe08b) 12%,var(--bg2));border:1px solid color-mix(in srgb,var(--good,#4fe08b) 30%,transparent);border-radius:13px;padding:13px 14px')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--good,#4fe08b)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              <div style={s('flex:1;min-width:0')}>
                <div style={s('font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{result?.name || 'Imported plan'}</div>
                <div style={s('font-size:11.5px;color:var(--text3)')}>Imported. Open it to review and edit.</div>
              </div>
            </div>
            <div style={s('display:flex;gap:10px;margin-top:18px')}>
              <div className="ctl" onClick={() => onImported(null)} style={s('flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>Done</div>
              <div className="ctl" onClick={() => onImported(result?.id || null)} style={s('flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--accent);color:var(--accent-ink)')}>Open plan</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default function PlansList({ plans, actions }) {
  const [items, setItems] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null); // plan pending delete-confirmation
  const [importOpen, setImportOpen] = useState(false);

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

      {/* new plan / import */}
      <div style={s('display:flex;gap:10px;margin-top:16px')}>
        <div className="ctl" onClick={() => plans?.create?.()} style={s('flex:1;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--accent);color:var(--accent-ink);border-radius:14px;padding:13px 15px;font-weight:700;font-size:14px')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>New plan
        </div>
        <div className="ctl" onClick={() => setImportOpen(true)} style={s('flex:1;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--bg2);border:1px solid var(--line);color:var(--text);border-radius:14px;padding:13px 15px;font-weight:700;font-size:14px')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M21 21H3" /></svg>Import PDF
        </div>
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

      {importOpen && (
        <ImportModal
          plans={plans}
          onClose={() => setImportOpen(false)}
          onImported={(id) => { setImportOpen(false); if (id) plans?.open?.(id); else load(); }}
        />
      )}
    </div>
  );
}
