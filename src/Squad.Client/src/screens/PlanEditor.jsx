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

export default function PlanEditor({ vm, actions }) {
  const [planName, setPlanName] = useState('');
  const [anchorType, setAnchorType] = useState('start'); // 'start' | 'target'
  const [anchorDate, setAnchorDate] = useState('');      // yyyy-mm-dd (start date, or race/target day)
  const [totalWeeks, setTotalWeeks] = useState('');      // length of the block, in weeks
  const [week, setWeek] = useState(1);
  const [weekTitle, setWeekTitle] = useState('');
  const [targetHrs, setTargetHrs] = useState('');
  const [targetLoad, setTargetLoad] = useState('');
  const [focus, setFocus] = useState('');
  const [sessions, setSessions] = useState({}); // day -> [session]
  const [assigned, setAssigned] = useState({}); // athleteId -> bool (default: assigned)
  const [editor, setEditor] = useState(null); // null | { id, day, sport, title, dur, load, z, note }

  // Real squad roster (empty until the live leaderboard/roster loads). No fake athletes.
  const roster = (vm?.squad ?? []).map((m) => ({
    id: m.id, name: m.name, initials: initialsOf(m), color: m.color || 'var(--text3)',
    level: m.status === 'crushing' ? 'On fire' : m.status === 'ontrack' ? 'On track' : 'Building',
    on: assigned[m.id] !== false, // default assigned
  }));

  // ── derived totals ──
  const daySessions = (d) => sessions[d] || [];
  const totLoad = DAYS.reduce((n, d) => n + daySessions(d).reduce((a, x) => a + (+x.load || 0), 0), 0);
  const totHrs = DAYS.reduce((n, d) => n + daySessions(d).reduce((a, x) => a + durHours(x.dur), 0), 0);
  const sessCount = DAYS.reduce((n, d) => n + daySessions(d).length, 0);
  const hrsPct = Math.min(100, Math.round(totHrs / (+targetHrs || 1) * 100));
  const loadPct = Math.min(100, Math.round(totLoad / (+targetLoad || 1) * 100));
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

  // ── session editing ──
  const openSession = (day, id) => {
    const sess = id ? daySessions(day).find((x) => x.id === id) : null;
    setEditor(sess ? { ...sess, day } : { id: null, day, sport: 'Bike', title: '', dur: '1:00', load: '', z: '', note: '' });
  };
  const editField = (k, v) => setEditor((e) => ({ ...e, [k]: v }));
  const saveSession = () => {
    setSessions((prev) => {
      const list = (prev[editor.day] || []).slice();
      if (editor.id) {
        const i = list.findIndex((x) => x.id === editor.id);
        if (i >= 0) list[i] = { ...editor };
      } else {
        list.push({ ...editor, id: 'x' + Date.now() });
      }
      return { ...prev, [editor.day]: list };
    });
    setEditor(null);
  };
  const deleteSession = () => {
    setSessions((prev) => ({ ...prev, [editor.day]: (prev[editor.day] || []).filter((x) => x.id !== editor.id) }));
    setEditor(null);
  };
  const toggleAthlete = (id) => setAssigned((a) => ({ ...a, [id]: a[id] === false }));

  return (
    <>
      <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
        {/* eyebrow + back */}
        <div style={s('display:flex;align-items:center;gap:10px')}>
          <div className="ctl" onClick={() => actions.go('plan')} style={s('width:30px;height:30px;border-radius:9px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
          </div>
          <div style={s('display:flex;align-items:center;gap:8px')}>
            <div style={s('width:22px;height:22px;border-radius:7px;background:var(--accent);display:flex;align-items:center;justify-content:center')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
            </div>
            <span style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Coach · Plan editor</span>
          </div>
        </div>

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
            <div style={s('flex:1.4')}>
              <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px')}>{anchorType === 'target' ? 'Race / target day' : 'Start date'}</div>
              <input value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} type="date"
                style={s('width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
            </div>
            <div style={s('flex:1')}>
              <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px')}>Total weeks</div>
              <input value={totalWeeks} onChange={(e) => { setTotalWeeks(e.target.value); setWeek((w) => { const n = (+e.target.value > 0) ? Math.floor(+e.target.value) : null; return Math.max(1, n ? Math.min(n, w) : w); }); }} type="number" min="1" placeholder="—"
                style={s('width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
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
          <input value={weekTitle} onChange={(e) => setWeekTitle(e.target.value)} placeholder="Week title"
            style={s('width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:11px 13px;font-size:15px;font-weight:700;color:var(--text);outline:none;font-family:inherit')} />
          <div style={s('display:flex;gap:10px;margin-top:10px')}>
            <div style={s('flex:1')}>
              <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px')}>Target hours</div>
              <input value={targetHrs} onChange={(e) => setTargetHrs(e.target.value)} type="number" placeholder="—"
                style={s('width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
            </div>
            <div style={s('flex:1')}>
              <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px')}>Target load</div>
              <input value={targetLoad} onChange={(e) => setTargetLoad(e.target.value)} type="number" placeholder="—"
                style={s('width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
            </div>
          </div>
          <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin:12px 0 5px')}>Week focus</div>
          <textarea value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="What this week is about…"
            style={s('width:100%;min-height:52px;resize:vertical;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:13px;color:var(--text);outline:none;line-height:1.5;font-family:inherit')} />
        </div>

        {/* planned vs target */}
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 15px;margin-top:12px')}>
          <div style={s('display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:6px')}>
            <span style={s('color:var(--text2)')}>Planned hours</span>
            <span className="mono" style={s('font-weight:700')}>{totHrs.toFixed(1)} / {targetHrs || '—'}h</span>
          </div>
          <div style={s('height:7px;border-radius:4px;background:var(--bg4);overflow:hidden')}><div style={s('height:100%;width:' + hrsPct + '%;background:var(--accent);border-radius:4px')} /></div>
          <div style={s('display:flex;justify-content:space-between;font-size:11.5px;margin:11px 0 6px')}>
            <span style={s('color:var(--text2)')}>Planned load</span>
            <span className="mono" style={s('font-weight:700')}>{totLoad} / {targetLoad || '—'}</span>
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

        <div className="ctl" style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:14px;border-radius:14px;font-weight:700;font-size:14px;margin-top:18px')}>Publish to {assignedCount} athlete{assignedCount === 1 ? '' : 's'}</div>
        <div style={s('text-align:center;font-size:11px;color:var(--text3);margin-top:8px;line-height:1.5')}>Assigned athletes get this week's sessions and targets, and are notified when you publish.</div>
      </div>

      {editor && <SessionSheet editor={editor} onField={editField} onSave={saveSession} onDelete={deleteSession} onClose={() => setEditor(null)} />}
    </>
  );
}
