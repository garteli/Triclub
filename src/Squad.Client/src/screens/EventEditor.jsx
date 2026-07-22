import { useEffect, useMemo, useState } from 'react';
import { s, html } from '../lib/style.js';
import { Back } from './wizard.jsx';
import { listCourses } from '../lib/courses.js';
import { createSquadEvent, updateSquadEvent, toOffsetIso, toLocalInput } from '../lib/events.js';

// Add / edit a group session (event). Reached from the Events tab: coach taps "Add event"
// (new) or a row's Edit (state.selEvent set). On save it POSTs (create) or PUTs (edit) and
// returns to the Events list. New events can be published now or saved as a draft; editing
// keeps the event's current publish state.

const SPORTS = {
  0: { label: 'Session', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  1: { label: 'Swim', icon: '<path d="M2 16c1.5 0 1.5 1.5 3 1.5S8.5 16 10 16s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><path d="M2 20c1.5 0 1.5 1.5 3 1.5S8.5 20 10 20s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><circle cx="15" cy="6" r="2"/><path d="M6 13l5-4 3 2 3-3"/>' },
  2: { label: 'Ride', icon: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5"/>' },
  3: { label: 'Run', icon: '<circle cx="14" cy="5" r="2"/><path d="M11 21l1.5-5-2.5-2 1-5 3 2 2 1M8 12l1-4 3-1"/>' },
};

// datetime-local default: the next round hour ("yyyy-MM-ddTHH:mm" in local time).
const defaultWhen = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000); d.setMinutes(0, 0, 0);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const SportIcon = ({ sport, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={html((SPORTS[sport] || SPORTS[0]).icon)} />
);

const inputStyle = 'background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:11px 12px;font-size:13px;color:var(--text);outline:none;font-family:inherit;width:100%';

export default function EventEditor({ vm, state, actions, getToken, onDataChanged }) {
  const squadId = vm.activeClubId;
  const editing = state?.selEvent || null;
  const isEdit = !!editing;

  const [title, setTitle] = useState(editing?.title || '');
  const [sport, setSport] = useState(editing?.sport ?? 2);
  const [when, setWhen] = useState(() => (editing ? toLocalInput(editing.start) : defaultWhen()));
  const [courseId, setCourseId] = useState(editing?.courseId ? String(editing.courseId) : '');
  const [notes, setNotes] = useState(editing?.notes || '');

  const [courses, setCourses] = useState(null); // null = loading
  const [busy, setBusy] = useState('');         // '', 'publish', 'draft', 'save'
  const [error, setError] = useState('');

  useEffect(() => {
    let ok = true;
    (async () => {
      try { const t = await getToken?.(); const cs = await listCourses(t); if (ok) setCourses(cs); }
      catch { if (ok) setCourses([]); }
    })();
    return () => { ok = false; };
  }, [getToken]);

  const selectedCourse = useMemo(
    () => (courses || []).find((c) => String(c.id) === String(courseId)) || null, [courses, courseId]);

  const canSave = title.trim() && when && !busy;

  // mode: 'publish' | 'draft' (create) or 'save' (edit). published only applies on create.
  const save = async (mode) => {
    if (!title.trim()) { setError('Give the session a title.'); return; }
    const start = toOffsetIso(when);
    if (!start) { setError('Pick a valid date and time.'); return; }
    setBusy(mode); setError('');
    try {
      const tok = await getToken?.();
      const body = { title: title.trim(), sport, start, courseId: courseId || null, notes: notes.trim() || null };
      if (isEdit) await updateSquadEvent(tok, squadId, editing.id, body);
      else await createSquadEvent(tok, squadId, { ...body, published: mode === 'publish' });
      onDataChanged?.();
      actions.go('events');
    } catch (e) {
      setError(e?.message || 'Could not save the session.');
      setBusy('');
    }
  };

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <div style={s('display:flex;align-items:center;gap:12px;margin:6px 0 4px')}>
        <Back onClick={() => actions.go('events')} />
        <div style={s('font-size:20px;font-weight:700;letter-spacing:-.4px')}>{isEdit ? 'Edit event' : 'New event'}</div>
      </div>

      <div style={s('display:flex;flex-direction:column;gap:12px;margin-top:14px')}>
        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 2px 7px')}>Title</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Saturday morning ride" style={s(inputStyle)} />
        </div>

        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 2px 7px')}>Type</div>
          <div style={s('display:flex;gap:7px')}>
            {[2, 0, 1, 3].map((n) => (
              <div key={n} className="ctl" onClick={() => setSport(n)}
                style={s(`flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;border-radius:10px;font-size:12px;font-weight:700;border:1px solid ${sport === n ? 'var(--accent)' : 'var(--line)'};background:${sport === n ? 'var(--accent-dim)' : 'var(--bg3)'};color:${sport === n ? 'var(--accent)' : 'var(--text2)'}`)}>
                <SportIcon sport={n} />{SPORTS[n].label}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 2px 7px')}>Date &amp; time</div>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={s(inputStyle)} />
        </div>

        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 2px 7px')}>Route</div>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={s(inputStyle)}>
            <option value="">{courses === null ? 'Loading routes…' : 'No route (optional)'}</option>
            {(courses || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.distanceKm ? ` · ${c.distanceKm.toFixed(1)} km` : ''}</option>
            ))}
          </select>
          {selectedCourse && <div style={s('font-size:11px;color:var(--text3);margin:6px 2px 0')}>Route: {selectedCourse.name}</div>}
        </div>

        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 2px 7px')}>Notes</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Meeting point, pace, what to bring…"
            style={s(inputStyle + ';resize:vertical;line-height:1.4')} />
        </div>

        {error && <div style={s('font-size:12.5px;color:var(--bad);font-weight:600')}>{error}</div>}

        {isEdit ? (
          <div className={canSave ? 'ctl' : undefined} onClick={canSave ? () => save('save') : undefined}
            style={s(`text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px;background:var(--accent);color:var(--accent-ink);opacity:${canSave ? 1 : 0.5}`)}>
            {busy === 'save' ? 'Saving…' : 'Save changes'}
          </div>
        ) : (
          <div style={s('display:flex;gap:9px')}>
            <div className={canSave ? 'ctl' : undefined} onClick={canSave ? () => save('draft') : undefined}
              style={s(`flex:1;text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:13.5px;background:var(--bg3);border:1px solid var(--line);color:var(--text);opacity:${canSave ? 1 : 0.5}`)}>
              {busy === 'draft' ? 'Saving…' : 'Save as draft'}
            </div>
            <div className={canSave ? 'ctl' : undefined} onClick={canSave ? () => save('publish') : undefined}
              style={s(`flex:1;text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:13.5px;background:var(--accent);color:var(--accent-ink);opacity:${canSave ? 1 : 0.5}`)}>
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
