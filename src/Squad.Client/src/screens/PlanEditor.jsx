import { useState } from 'react';
import { s, html } from '../lib/style.js';

// Coach's plan editor — build a squad's training week, assign athletes, and
// "publish". The layout is ported from the design handoff (the `planeditor`
// screen), but it starts BLANK: no seeded plan, sessions, or fake athletes.
// The assignable roster is the real squad (vm.squad, derived from the live
// leaderboard); the coach fills in the week themselves. Self-contained local
// state, matching the CreateGroup / EditProfile screen conventions.

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Sport → accent colour + glyph markup (UI, not data).
const SPORTS = [['Bike', 'var(--bike)'], ['Swim', 'var(--swim)'], ['Run', 'var(--run)'], ['Gym', '#c68bff'], ['Rest', 'var(--text3)']];
const SPORT_COLOR = { Bike: 'var(--bike)', Swim: 'var(--swim)', Run: 'var(--run)', Gym: '#c68bff', Rest: 'var(--text3)' };
const SPORT_PATH = {
  Bike: '<circle cx="5.5" cy="17" r="3.4"/><circle cx="18.5" cy="17" r="3.4"/><path d="M5.5 17l4.5-8.5h4"/><path d="M14 8.5l4.5 8.5"/><path d="M8 8.5h4l2 4"/>',
  Run: '<circle cx="16" cy="5" r="1.8"/><path d="M14.5 8l-4 3.5 2.5 2 1 5.5"/><path d="M10.5 11.5l-4 1"/><path d="M13 13.5l3.5 1"/>',
  Swim: '<circle cx="17.5" cy="6.5" r="1.7"/><path d="M5 12l4-2.5 3.5 2 3-1.5"/><path d="M3 18c1.8-1.4 3.6-1.4 5.4 0s3.6 1.4 5.4 0 3.6-1.4 5.4 0"/>',
  Gym: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
  Rest: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
};
const sportColor = (sp) => SPORT_COLOR[sp] || 'var(--text3)';
const sportGlyph = (sp) => html(
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
  (SPORT_PATH[sp] || SPORT_PATH.Rest) + '</svg>',
);

const durHours = (dur) => { const p = (dur || '0:00').split(':'); return (+p[0] || 0) + (+p[1] || 0) / 60; };

// ── plan-schedule date math (weeks are Monday-anchored) ──
const MS_DAY = 86400000;
const addDays = (d, n) => new Date(d.getTime() + n * MS_DAY);
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
const parseDate = (v) => { if (!v) return null; const [y, m, dd] = v.split('-').map(Number); return (y && m && dd) ? new Date(y, m - 1, dd) : null; };
const fmtMD = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// One week's editable content. Sessions, targets and title are PER WEEK — keyed by
// week number in the `weeks` map — so navigating weeks loads that week's own data.
const BLANK_WEEK = { title: '', targetHrs: '', targetLoad: '', focus: '', sessions: {} };

// Initials fallback when the roster row doesn't carry them (e.g. "You").
const initialsOf = (m) => m.initials || (m.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

// ── Session editor bottom sheet ──────────────────────────────────────────────
function SessionSheet({ editor, onField, onSave, onDelete, onClose }) {
  const canDelete = !!editor.id;
  return (
    <>
      <div className="ctl" onClick={onClose} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
      {/* Viewport-anchored (fixed): absolute would pin to Phone's full-height scroll
          wrapper, dropping the sheet far below the fold on a long screen. The wrapper
          is click-through (pointer-events:none) so taps outside the sheet hit the
          overlay and close it; the sheet re-enables its own pointer events. */}
      <div style={s('position:fixed;left:0;right:0;bottom:0;z-index:51;display:flex;justify-content:center;pointer-events:none')}>
      <div className="scr" style={s('width:100%;max-width:480px;pointer-events:auto;background:var(--bg);border-radius:24px 24px 0 0;border-top:1px solid var(--line2);max-height:90dvh;overflow-y:auto;padding:14px 18px 28px;animation:floatUp .3s ease')}>
        <div style={s('width:40px;height:4px;border-radius:3px;background:var(--line2);margin:0 auto 14px')} />
        <div style={s('display:flex;align-items:center;justify-content:space-between')}>
          <div style={s('font-size:18px;font-weight:700')}>{editor.id ? 'Edit session' : 'New session'} · {editor.day}</div>
          <div className="ctl" onClick={onClose} style={s('font-size:13px;color:var(--text2);font-weight:600')}>Close</div>
        </div>

        <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:16px 0 7px')}>Sport</div>
        <div style={s('display:flex;gap:6px')}>
          {SPORTS.map(([sp, c]) => {
            const on = editor.sport === sp;
            return (
              <div key={sp} className="ctl" onClick={() => onField('sport', sp)}
                style={s('flex:1;text-align:center;padding:9px 4px;border-radius:10px;font-size:11px;font-weight:700;' +
                  (on ? 'background:' + c + ';color:#0c0e11' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'))}>{sp}</div>
            );
          })}
        </div>

        <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:16px 0 7px')}>Title</div>
        <input value={editor.title} onChange={(e) => onField('title', e.target.value)} placeholder="e.g. Threshold 3×12′"
          style={s('width:100%;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />

        <div style={s('display:flex;gap:10px;margin-top:14px')}>
          <div style={s('flex:1')}>
            <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:7px')}>Duration</div>
            <input value={editor.dur} onChange={(e) => onField('dur', e.target.value)} placeholder="1:15"
              style={s('width:100%;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
          </div>
          <div style={s('flex:1')}>
            <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:7px')}>Load</div>
            <input value={editor.load} onChange={(e) => onField('load', e.target.value)} type="number" placeholder="60"
              style={s('width:100%;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
          </div>
        </div>

        <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:14px 0 7px')}>Target zone</div>
        <input value={editor.z} onChange={(e) => onField('z', e.target.value)} placeholder="Zone 4 · FTP"
          style={s('width:100%;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />

        <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:14px 0 7px')}>Coach note</div>
        <textarea value={editor.note} onChange={(e) => onField('note', e.target.value)} placeholder="Guidance for the squad…"
          style={s('width:100%;min-height:70px;resize:vertical;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--text);outline:none;line-height:1.5;font-family:inherit')} />

        <div style={s('display:flex;gap:10px;margin-top:18px')}>
          {canDelete && (
            <div className="ctl" onClick={onDelete} style={s('width:52px;background:color-mix(in srgb,var(--bad) 14%,var(--bg2));border:1px solid color-mix(in srgb,var(--bad) 35%,transparent);color:var(--bad);border-radius:13px;display:flex;align-items:center;justify-content:center')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
            </div>
          )}
          <div className="ctl" onClick={onSave} style={s('flex:1;background:var(--accent);color:var(--accent-ink);text-align:center;padding:14px;border-radius:13px;font-weight:700;font-size:14px')}>Save session</div>
        </div>
      </div>
      </div>
    </>
  );
}

// Parse a saved plan's JSON doc (never throw — a corrupt doc just starts blank).
function parseDoc(plan) {
  if (!plan?.doc) return null;
  try { return typeof plan.doc === 'string' ? JSON.parse(plan.doc) : plan.doc; } catch { return null; }
}

// `plan` is the saved plan being edited ({ id, name, doc }) or null for a new one.
// Mount fresh per plan (App keys the screen by plan id), so seeding state from the
// doc in the useState initializers is enough — they run once on mount.
export default function PlanEditor({ vm, actions, plan, plans, onPublishPlan }) {
  const doc = parseDoc(plan);
  const [planId, setPlanId] = useState(plan?.id ?? null);
  const [planName, setPlanName] = useState(doc?.planName ?? plan?.name ?? '');
  const [anchorType, setAnchorType] = useState(doc?.anchorType ?? 'start'); // 'start' | 'target'
  const [anchorDate, setAnchorDate] = useState(doc?.anchorDate ?? '');      // yyyy-mm-dd (start date, or race/target day)
  const [totalWeeks, setTotalWeeks] = useState(doc?.totalWeeks ?? '');      // length of the block, in weeks
  const [week, setWeek] = useState(1);
  const [weeks, setWeeks] = useState(doc?.weeks ?? {}); // weekNum -> { title, targetHrs, targetLoad, focus, sessions:{day:[...]} }
  const [assigned, setAssigned] = useState(doc?.assigned ?? {}); // athleteId -> bool (default: assigned)
  const [editor, setEditor] = useState(null); // null | { id, day, week, sport, title, dur, load, z, note }
  const [pub, setPub] = useState({ status: 'idle', msg: '' }); // idle | busy | done | error
  const [save, setSave] = useState({ status: 'idle', msg: '' }); // idle | busy | saved | error
  const [unpub, setUnpub] = useState({ status: 'idle', msg: '' }); // idle | busy | done | error
  const [confirmUnpub, setConfirmUnpub] = useState(false);

  // The current week's editable slice, and a setter for one of its fields.
  const cur = weeks[week] || BLANK_WEEK;
  const setWeekField = (k, v) => setWeeks((p) => ({ ...p, [week]: { ...(p[week] || BLANK_WEEK), [k]: v } }));

  // Real squad roster (empty until the live leaderboard/roster loads). No fake athletes.
  const roster = (vm?.squad ?? []).map((m) => ({
    id: m.id, name: m.name, initials: initialsOf(m), color: m.color || 'var(--text3)',
    level: m.status === 'crushing' ? 'On fire' : m.status === 'ontrack' ? 'On track' : 'Building',
    on: assigned[m.id] !== false, // default assigned
  }));

  // ── derived totals (for the current week) ──
  const daySessions = (d) => cur.sessions[d] || [];
  const totLoad = DAYS.reduce((n, d) => n + daySessions(d).reduce((a, x) => a + (+x.load || 0), 0), 0);
  const totHrs = DAYS.reduce((n, d) => n + daySessions(d).reduce((a, x) => a + durHours(x.dur), 0), 0);
  const sessCount = DAYS.reduce((n, d) => n + daySessions(d).length, 0);
  const hrsPct = Math.min(100, Math.round(totHrs / (+cur.targetHrs || 1) * 100));
  const loadPct = Math.min(100, Math.round(totLoad / (+cur.targetLoad || 1) * 100));
  const assignedCount = roster.filter((a) => a.on).length;

  // ── derived plan schedule (real calendar dates from the anchor + length) ──
  const nWeeks = (+totalWeeks > 0) ? Math.floor(+totalWeeks) : null;
  const anchor = parseDate(anchorDate);
  // 'start' anchors week 1; 'target' (race day) anchors the LAST week, so we count back.
  const startMonday = anchor
    ? (anchorType === 'target' ? addDays(mondayOf(anchor), -(((nWeeks || 1) - 1) * 7)) : mondayOf(anchor))
    : null;
  const weekStart = startMonday ? addDays(startMonday, (week - 1) * 7) : null;
  const weekEnd = weekStart ? addDays(weekStart, 6) : null;
  const weekRange = weekStart ? `${fmtMD(weekStart)} – ${fmtMD(weekEnd)}` : null;
  const blockEnd = (startMonday && nWeeks) ? addDays(startMonday, nWeeks * 7 - 1) : null;
  const clampWeek = (w) => Math.max(1, nWeeks ? Math.min(nWeeks, w) : w);

  // ── session editing (scoped to the week the sheet was opened on) ──
  const openSession = (day, id) => {
    const sess = id ? daySessions(day).find((x) => x.id === id) : null;
    setEditor(sess ? { ...sess, day, week } : { id: null, day, week, sport: 'Bike', title: '', dur: '1:00', load: '', z: '', note: '' });
  };
  const editField = (k, v) => setEditor((e) => ({ ...e, [k]: v }));
  const saveSession = () => {
    setWeeks((prev) => {
      const wk = prev[editor.week] || BLANK_WEEK;
      const list = (wk.sessions[editor.day] || []).slice();
      const { week: _w, ...body } = editor;
      if (editor.id) {
        const i = list.findIndex((x) => x.id === editor.id);
        if (i >= 0) list[i] = { ...body };
      } else {
        list.push({ ...body, id: 'x' + Date.now() });
      }
      return { ...prev, [editor.week]: { ...wk, sessions: { ...wk.sessions, [editor.day]: list } } };
    });
    setEditor(null);
  };
  const deleteSession = () => {
    setWeeks((prev) => {
      const wk = prev[editor.week] || BLANK_WEEK;
      return { ...prev, [editor.week]: { ...wk, sessions: { ...wk.sessions, [editor.day]: (wk.sessions[editor.day] || []).filter((x) => x.id !== editor.id) } } };
    });
    setEditor(null);
  };
  const toggleAthlete = (id) => setAssigned((a) => ({ ...a, [id]: a[id] === false }));

  // ── save this plan (the coach's working copy — a named, reloadable doc) ──
  const buildDoc = () => JSON.stringify({ planName, anchorType, anchorDate, totalWeeks, weeks, assigned });
  // Persist the working copy; drives the Save indicator and returns the plan id
  // (adopting a freshly-created one). Throws on failure — callers decide fatality.
  const persist = async () => {
    if (!plans?.save) throw new Error('Sign in as a coach to save.');
    setSave({ status: 'busy', msg: '' });
    const res = await plans.save({ id: planId, name: planName || 'Untitled plan', doc: buildDoc() });
    const id = res?.id ?? planId;
    if (id && id !== planId) setPlanId(id); // adopt the new id so re-saves update
    setSave({ status: 'saved', msg: 'Saved' });
    setTimeout(() => setSave((sv) => (sv.status === 'saved' ? { status: 'idle', msg: '' } : sv)), 1800);
    return id;
  };
  const savePlanNow = async () => {
    if (save.status === 'busy') return;
    try { await persist(); } catch (e) { setSave({ status: 'error', msg: e?.message || 'Could not save.' }); }
  };

  // ── save a copy under the coach's account, and continue editing the copy ──
  const duplicate = async () => {
    if (save.status === 'busy') return;
    if (!plans?.save) { setSave({ status: 'error', msg: 'Sign in as a coach to save.' }); return; }
    setSave({ status: 'busy', msg: '' });
    try {
      const res = await plans.save({ id: null, name: (planName || 'Untitled plan') + ' (copy)', doc: buildDoc() });
      setSave({ status: 'saved', msg: 'Copied' });
      setTimeout(() => setSave((sv) => (sv.status === 'saved' ? { status: 'idle', msg: '' } : sv)), 1800);
      if (res?.id && plans.open) plans.open(res.id); // remount the editor on the new copy
    } catch (e) {
      setSave({ status: 'error', msg: e?.message || 'Could not save a copy.' });
    }
  };

  // Build the workout list for a scope: 'all' weeks, or a single week number.
  const workoutsFor = (scope) => {
    const out = [];
    for (const [wnStr, wk] of Object.entries(weeks)) {
      const wn = +wnStr;
      if (wn < 1 || wn > nWeeks) continue;
      if (scope !== 'all' && wn !== scope) continue;
      const wkMon = addDays(startMonday, (wn - 1) * 7);
      DAYS.forEach((day, di) => {
        (wk.sessions?.[day] || []).forEach((x) => {
          out.push({
            date: toISO(addDays(wkMon, di)),
            discipline: (x.sport || 'rest').toLowerCase(),
            title: (x.title || 'Session').slice(0, 80),
            sub: (x.z || '').slice(0, 120),
            durationMin: Math.round(durHours(x.dur) * 60),
            load: +x.load || 0,
          });
        });
      });
    }
    return out;
  };

  // ── publish the whole plan, or just one week, to each assigned athlete ──
  const doPublish = async (scope) => { // scope: 'all' | <week number>
    if (pub.status === 'busy') return;
    if (!anchor || !startMonday || !nWeeks) { setPub({ status: 'error', msg: 'Set a start/target date and total weeks first.' }); return; }
    const athleteIds = roster.filter((a) => a.on).map((a) => a.id);
    if (!athleteIds.length) { setPub({ status: 'error', msg: 'Assign at least one athlete.' }); return; }
    const oneWeek = scope !== 'all';
    const workouts = workoutsFor(scope);
    if (!workouts.length) { setPub({ status: 'error', msg: oneWeek ? `Week ${scope} has no sessions to publish.` : 'Add at least one session before publishing.' }); return; }
    if (!onPublishPlan) { setPub({ status: 'error', msg: 'Sign in as a coach to publish.' }); return; }
    setPub({ status: 'busy', msg: '' });
    try {
      // Save the coach's working copy first so the published rows carry its plan id (best-effort).
      let id = planId;
      try { id = await persist(); } catch { /* keep going; the athlete write is the primary action */ }
      const startDate = oneWeek ? toISO(addDays(startMonday, (scope - 1) * 7)) : toISO(startMonday);
      const res = await onPublishPlan({
        athleteIds, planId: id || planId || undefined, planName: planName || null,
        startDate, weeks: oneWeek ? 1 : nWeeks, workouts,
      });
      const n = res?.published ?? athleteIds.length;
      setPub({ status: 'done', msg: oneWeek ? `Week ${scope} published to ${n} athlete${n === 1 ? '' : 's'}.` : `Published to ${n} athlete${n === 1 ? '' : 's'}.` });
    } catch (e) {
      setPub({ status: 'error', msg: e?.message || 'Could not publish. Try again.' });
    }
  };

  // ── unpublish: pull the plan back off every assigned athlete's calendar ──
  const unpublish = async () => {
    if (unpub.status === 'busy') return;
    if (!planId) { setUnpub({ status: 'error', msg: 'Save the plan first — nothing has been published yet.' }); setConfirmUnpub(false); return; }
    if (!plans?.unpublish) { setUnpub({ status: 'error', msg: 'Sign in as a coach.' }); setConfirmUnpub(false); return; }
    setUnpub({ status: 'busy', msg: '' });
    try {
      const r = await plans.unpublish(planId);
      setConfirmUnpub(false);
      setUnpub({ status: 'done', msg: r?.unpublished ? 'Removed from every athlete.' : 'This plan wasn’t published.' });
    } catch (e) {
      setConfirmUnpub(false);
      setUnpub({ status: 'error', msg: e?.message || 'Could not unpublish.' });
    }
  };

  return (
    <>
      <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
        {/* back + title now in the global app header; keep the save controls */}
        <div style={s('display:flex;align-items:center;justify-content:flex-end;gap:8px')}>
          <div className={save.status === 'busy' ? undefined : 'ctl'} onClick={save.status === 'busy' ? undefined : duplicate}
            style={s('flex:none;font-size:12.5px;font-weight:700;padding:8px 13px;border-radius:10px;background:var(--bg3);border:1px solid var(--line2);color:var(--text2);display:flex;align-items:center;gap:6px')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>Copy
          </div>
          <div className={save.status === 'busy' ? undefined : 'ctl'} onClick={save.status === 'busy' ? undefined : savePlanNow}
            style={s('flex:none;font-size:12.5px;font-weight:700;padding:8px 15px;border-radius:10px;' + (save.status === 'saved' ? 'background:color-mix(in srgb,var(--good) 16%,transparent);color:var(--good)' : 'background:var(--bg3);border:1px solid var(--line2);color:var(--text)'))}>
            {save.status === 'busy' ? 'Saving…' : save.status === 'saved' ? (save.msg || 'Saved') + ' ✓' : 'Save'}
          </div>
        </div>
        {save.status === 'error' && <div style={s('font-size:11.5px;color:var(--bad);font-weight:600;margin-top:8px')}>{save.msg}</div>}

        {/* plan name */}
        <input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="Plan name"
          style={s('width:100%;background:transparent;border:none;font-family:inherit;font-size:23px;font-weight:700;letter-spacing:-.5px;color:var(--text);outline:none;margin-top:6px;padding:0')} />
        <div style={s('font-size:11.5px;color:var(--accent);font-weight:700;margin-bottom:4px')}>{vm?.squadName || 'Your club'} · {nWeeks ? nWeeks + '-week' : 'training'} block</div>

        {/* plan schedule: anchor (start OR target/race day) + length */}
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 15px;margin-top:12px')}>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:9px')}>Plan schedule</div>
          <div style={s('display:flex;gap:6px;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:4px')}>
            {[['start', 'Start date'], ['target', 'Target day']].map(([id, label]) => (
              <div key={id} className="ctl" onClick={() => setAnchorType(id)}
                style={s('flex:1;text-align:center;padding:8px;border-radius:8px;font-size:12px;font-weight:600;' + (anchorType === id ? 'background:var(--accent);color:var(--accent-ink)' : 'color:var(--text2)'))}>{label}</div>
            ))}
          </div>
          <div style={s('display:flex;gap:10px;margin-top:10px')}>
            <div style={s('flex:1.4;min-width:0')}>
              <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px')}>{anchorType === 'target' ? 'Race / target day' : 'Start date'}</div>
              <input value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} type="date"
                style={s('width:100%;box-sizing:border-box;min-width:0;-webkit-appearance:none;appearance:none;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
            </div>
            <div style={s('flex:1;min-width:0')}>
              <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px')}>Total weeks</div>
              <input value={totalWeeks} onChange={(e) => { setTotalWeeks(e.target.value); setWeek((w) => { const n = (+e.target.value > 0) ? Math.floor(+e.target.value) : null; return Math.max(1, n ? Math.min(n, w) : w); }); }} type="number" min="1" placeholder="—"
                style={s('width:100%;box-sizing:border-box;min-width:0;-webkit-appearance:none;appearance:none;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
            </div>
          </div>
          {startMonday && (
            <div style={s('font-size:11.5px;color:var(--text2);margin-top:10px')}>
              {blockEnd
                ? <>Runs <span style={s('color:var(--text);font-weight:600')}>{fmtMD(startMonday)} → {fmtMD(blockEnd)}</span> · {nWeeks} week{nWeeks === 1 ? '' : 's'}{anchorType === 'target' && anchor ? ` · targets ${fmtMD(anchor)}` : ''}</>
                : <>Starts week of <span style={s('color:var(--text);font-weight:600')}>{fmtMD(startMonday)}</span> · set total weeks</>}
            </div>
          )}
        </div>

        {/* week meta: title + targets + focus */}
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 15px;margin-top:12px')}>
          <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:9px')}>
            <div>
              <span style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700')}>Week {week}{nWeeks ? ' of ' + nWeeks : ''}</span>
              {weekRange && <div style={s('font-size:12.5px;color:var(--text);font-weight:600;margin-top:2px')}>{weekRange}</div>}
            </div>
            <div style={s('display:flex;gap:6px')}>
              <div className="ctl" onClick={() => setWeek((w) => clampWeek(w - 1))} style={s('width:26px;height:26px;border-radius:8px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text2)')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
              </div>
              <div className="ctl" onClick={() => setWeek((w) => clampWeek(w + 1))} style={s('width:26px;height:26px;border-radius:8px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text2)')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
              </div>
            </div>
          </div>
          <input value={cur.title} onChange={(e) => setWeekField('title', e.target.value)} placeholder="Week title"
            style={s('width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:11px 13px;font-size:15px;font-weight:700;color:var(--text);outline:none;font-family:inherit')} />
          <div style={s('display:flex;gap:10px;margin-top:10px')}>
            <div style={s('flex:1')}>
              <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px')}>Target hours</div>
              <input value={cur.targetHrs} onChange={(e) => setWeekField('targetHrs', e.target.value)} type="number" placeholder="—"
                style={s('width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
            </div>
            <div style={s('flex:1')}>
              <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px')}>Target load</div>
              <input value={cur.targetLoad} onChange={(e) => setWeekField('targetLoad', e.target.value)} type="number" placeholder="—"
                style={s('width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
            </div>
          </div>
          <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin:12px 0 5px')}>Week focus</div>
          <textarea value={cur.focus} onChange={(e) => setWeekField('focus', e.target.value)} placeholder="What this week is about…"
            style={s('width:100%;min-height:52px;resize:vertical;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:13px;color:var(--text);outline:none;line-height:1.5;font-family:inherit')} />
        </div>

        {/* planned vs target */}
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 15px;margin-top:12px')}>
          <div style={s('display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:6px')}>
            <span style={s('color:var(--text2)')}>Planned hours</span>
            <span className="mono" style={s('font-weight:700')}>{totHrs.toFixed(1)} / {cur.targetHrs || '—'}h</span>
          </div>
          <div style={s('height:7px;border-radius:4px;background:var(--bg4);overflow:hidden')}><div style={s('height:100%;width:' + hrsPct + '%;background:var(--accent);border-radius:4px')} /></div>
          <div style={s('display:flex;justify-content:space-between;font-size:11.5px;margin:11px 0 6px')}>
            <span style={s('color:var(--text2)')}>Planned load</span>
            <span className="mono" style={s('font-weight:700')}>{totLoad} / {cur.targetLoad || '—'}</span>
          </div>
          <div style={s('height:7px;border-radius:4px;background:var(--bg4);overflow:hidden')}><div style={s('height:100%;width:' + loadPct + '%;background:var(--bike);border-radius:4px')} /></div>
        </div>

        {/* assign athletes */}
        <div style={s('display:flex;align-items:baseline;justify-content:space-between;margin:20px 2px 10px')}>
          <span style={s('font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text2)')}>Assigned athletes</span>
          <span className="mono" style={s('font-size:12px;color:var(--accent);font-weight:700')}>{assignedCount}/{roster.length}</span>
        </div>
        {roster.length === 0 ? (
          <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:18px;text-align:center;font-size:12.5px;color:var(--text3);line-height:1.5')}>Your squad's athletes will appear here to assign once they've joined.</div>
        ) : (
          <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;overflow:hidden')}>
            {roster.map((a) => (
              <div key={a.id} className="ctl" onClick={() => toggleAthlete(a.id)} style={s('display:flex;align-items:center;gap:11px;padding:11px 13px;' + (a.on ? '' : 'opacity:.55'))}>
                <div style={s('width:34px;height:34px;border-radius:10px;background:' + a.color + ';flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#0c0e11')}>{a.initials}</div>
                <div style={s('flex:1;min-width:0')}>
                  <div style={s('font-size:13.5px;font-weight:700')}>{a.name}</div>
                  <div style={s('font-size:11px;color:var(--text3)')}>{a.level}</div>
                </div>
                <div style={s('width:24px;height:24px;border-radius:7px;flex:none;display:flex;align-items:center;justify-content:center;' + (a.on ? 'background:var(--accent)' : 'background:var(--bg3);border:1px solid var(--line2)'))}>
                  {a.on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* week schedule */}
        <div style={s('display:flex;align-items:baseline;justify-content:space-between;margin:22px 2px 4px')}>
          <span style={s('font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text2)')}>Week schedule</span>
        </div>

        <div style={s('display:flex;background:var(--bg2);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin-top:8px')}>
          <div style={s('flex:1;text-align:center;padding:12px')}>
            <div className="mono" style={s('font-size:18px;font-weight:700')}>{totHrs.toFixed(1)}<span style={s('font-size:11px;color:var(--text2)')}>h</span></div>
            <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px')}>Planned</div>
          </div>
          <div style={s('flex:1;text-align:center;padding:12px;border-left:1px solid var(--line)')}>
            <div className="mono" style={s('font-size:18px;font-weight:700;color:var(--accent)')}>{totLoad}</div>
            <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px')}>Load</div>
          </div>
          <div style={s('flex:1;text-align:center;padding:12px;border-left:1px solid var(--line)')}>
            <div className="mono" style={s('font-size:18px;font-weight:700')}>{sessCount}</div>
            <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px')}>Sessions</div>
          </div>
        </div>

        <div style={s('display:flex;flex-direction:column;gap:12px;margin-top:16px')}>
          {DAYS.map((day, di) => {
            const list = daySessions(day);
            const dayDate = weekStart ? addDays(weekStart, di) : null;
            return (
              <div key={day}>
                <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:7px')}>
                  <span style={s('font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text2)')}>{day}{dayDate ? <span style={s('color:var(--text3);font-weight:600;letter-spacing:0;text-transform:none;margin-left:7px')}>{fmtMD(dayDate)}</span> : null}</span>
                  <div className="ctl" onClick={() => openSession(day, null)} style={s('display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:var(--accent)')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Add
                  </div>
                </div>
                {list.length === 0 && (
                  <div className="ctl" onClick={() => openSession(day, null)} style={s('border:1px dashed var(--line2);border-radius:12px;padding:12px;text-align:center;font-size:12px;color:var(--text3)')}>Rest day · tap to add a session</div>
                )}
                <div style={s('display:flex;flex-direction:column;gap:8px')}>
                  {list.map((x) => {
                    const color = sportColor(x.sport);
                    return (
                      <div key={x.id} className="ctl" onClick={() => openSession(day, x.id)} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px;display:flex;align-items:center;gap:12px')}>
                        <div style={s('width:38px;height:38px;border-radius:11px;background:color-mix(in srgb,' + color + ' 16%,transparent);color:' + color + ';flex:none;display:flex;align-items:center;justify-content:center')} dangerouslySetInnerHTML={sportGlyph(x.sport)} />
                        <div style={s('flex:1;min-width:0')}>
                          <div style={s('font-size:14px;font-weight:700')}>{x.title || 'Untitled session'}</div>
                          <div style={s('font-size:11.5px;color:var(--text2)')}>{x.sport}{x.z ? ' · ' + x.z : ''}</div>
                        </div>
                        <div style={s('text-align:right;flex:none')}>
                          <div className="mono" style={s('font-size:12.5px;font-weight:700')}>{x.dur}</div>
                          <div className="mono" style={s('font-size:10.5px;color:var(--accent)')}>{+x.load || 0} load</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* publish: whole plan (primary) or just the current week */}
        <div className={pub.status === 'busy' ? undefined : 'ctl'} onClick={pub.status === 'busy' ? undefined : () => doPublish('all')}
          style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:14px;border-radius:14px;font-weight:700;font-size:14px;margin-top:18px;' + (pub.status === 'busy' ? 'opacity:.6' : ''))}>
          {pub.status === 'busy' ? 'Publishing…' : `Publish whole plan to ${assignedCount} athlete${assignedCount === 1 ? '' : 's'}`}
        </div>
        <div className={pub.status === 'busy' ? undefined : 'ctl'} onClick={pub.status === 'busy' ? undefined : () => doPublish(week)}
          style={s('text-align:center;padding:12px;border-radius:13px;font-weight:700;font-size:13.5px;margin-top:9px;background:var(--bg2);border:1px solid var(--line2);color:var(--text);' + (pub.status === 'busy' ? 'opacity:.6' : ''))}>
          Publish week {week} only
        </div>
        {pub.status === 'done' ? (
          <div style={s('display:flex;align-items:center;justify-content:center;gap:7px;text-align:center;font-size:12px;color:var(--good);font-weight:600;margin-top:10px')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>{pub.msg}
          </div>
        ) : pub.status === 'error' ? (
          <div style={s('text-align:center;font-size:12px;color:var(--bad);font-weight:600;margin-top:10px')}>{pub.msg}</div>
        ) : (
          <div style={s('text-align:center;font-size:11px;color:var(--text3);margin-top:8px;line-height:1.5')}>Assigned athletes get the sessions on their calendar. Publish the whole block, or push a single week at a time.</div>
        )}

        {/* unpublish: pull the plan back off athletes' calendars */}
        <div className="ctl" onClick={() => { setUnpub({ status: 'idle', msg: '' }); setConfirmUnpub(true); }}
          style={s('text-align:center;font-size:12px;font-weight:700;color:var(--bad);margin-top:16px;padding:6px')}>
          Unpublish — remove from all athletes
        </div>
        {unpub.status === 'done' && <div style={s('text-align:center;font-size:12px;color:var(--good);font-weight:600;margin-top:2px')}>{unpub.msg}</div>}
        {unpub.status === 'error' && <div style={s('text-align:center;font-size:12px;color:var(--bad);font-weight:600;margin-top:2px')}>{unpub.msg}</div>}
      </div>

      {editor && <SessionSheet editor={editor} onField={editField} onSave={saveSession} onDelete={deleteSession} onClose={() => setEditor(null)} />}

      {confirmUnpub && (
        <>
          <div className="ctl" onClick={unpub.status === 'busy' ? undefined : () => setConfirmUnpub(false)} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
          <div className="scr" style={s('position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(90%,420px);z-index:51;background:var(--bg);border:1px solid var(--line2);border-radius:20px;padding:20px;animation:floatUpCenter .25s ease')}>
            <div style={s('font-size:17px;font-weight:700')}>Unpublish this plan?</div>
            <div style={s('font-size:13px;color:var(--text2);line-height:1.5;margin-top:8px')}>Its sessions will be removed from every assigned athlete's calendar. Your saved plan is kept — you can re-publish anytime.</div>
            <div style={s('display:flex;gap:10px;margin-top:18px')}>
              <div className="ctl" onClick={unpub.status === 'busy' ? undefined : () => setConfirmUnpub(false)} style={s(`flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bg3);border:1px solid var(--line);color:var(--text2);opacity:${unpub.status === 'busy' ? 0.5 : 1}`)}>Cancel</div>
              <div className="ctl" onClick={unpub.status === 'busy' ? undefined : unpublish} style={s(`flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bad);color:#fff;opacity:${unpub.status === 'busy' ? 0.7 : 1}`)}>{unpub.status === 'busy' ? 'Removing…' : 'Unpublish'}</div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
