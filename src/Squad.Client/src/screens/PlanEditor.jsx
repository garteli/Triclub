import { useState } from 'react';
import { s, html } from '../lib/style.js';

// Coach's plan editor — build a squad's training week, assign athletes, and
// "publish". Ported 1:1 from the Claude Design handoff (the `planeditor` screen).
// Self-contained prototype state (local only, no backend), matching the app's
// other form-heavy screens (CreateGroup / EditProfile).

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Sport → accent colour + glyph markup (verbatim from the handoff).
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

const initialSessions = {
  Mon: [],
  Tue: [{ id: 't1', sport: 'Bike', title: 'Threshold 3×12′', dur: '1:15', load: 78, z: 'Zone 4', note: 'Hold the last interval — cadence 90+.' }],
  Wed: [{ id: 'w1', sport: 'Swim', title: 'Technique 8×100', dur: '1:00', load: 45, z: 'CSS', note: 'Focus on catch & rotation.' }],
  Thu: [{ id: 'th1', sport: 'Run', title: 'Tempo 20′', dur: '0:50', load: 62, z: 'Zone 3', note: '' }],
  Fri: [],
  Sat: [{ id: 's1', sport: 'Bike', title: 'Long endurance', dur: '3:00', load: 150, z: 'Zone 2', note: 'Steady, fuel every 30′.' }],
  Sun: [{ id: 'su1', sport: 'Run', title: 'Brick 2h+20′', dur: '2:20', load: 128, z: 'Zone 2-3', note: 'Off the bike, hold form.' }],
};

const initialRoster = [
  { id: 'noa', name: 'Noa Regev', initials: 'NR', color: '#ff9a4c', level: 'Advanced', on: true },
  { id: 'adam', name: 'Adam Bar', initials: 'AB', color: '#37c0ff', level: 'Intermediate', on: true },
  { id: 'maya', name: 'Maya Katz', initials: 'MK', color: '#c68bff', level: 'Intermediate', on: true },
  { id: 'roi', name: 'Roi Gal', initials: 'RG', color: '#4fe08b', level: 'Advanced', on: true },
  { id: 'yoav', name: 'Yoav Shani', initials: 'YS', color: '#ff6f61', level: 'Beginner', on: false },
  { id: 'itai', name: 'Itai Tal', initials: 'IT', color: '#ffce4a', level: 'Beginner', on: false },
  { id: 'tal', name: 'Tal Vardi', initials: 'TV', color: '#5a86ff', level: 'Advanced', on: true },
  { id: 'dana', name: 'Dana Levi', initials: 'DL', color: '#d6ff3f', level: 'Advanced', on: true },
];

// ── Session editor bottom sheet ──────────────────────────────────────────────
function SessionSheet({ editor, onField, onSave, onDelete, onClose }) {
  const canDelete = !!editor.id;
  return (
    <>
      <div className="ctl" onClick={onClose} style={s('position:absolute;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
      <div className="scr" style={s('position:absolute;left:0;right:0;bottom:0;z-index:51;background:var(--bg);border-radius:24px 24px 0 0;border-top:1px solid var(--line2);max-height:90%;overflow-y:auto;padding:14px 18px 28px;animation:floatUp .3s ease')}>
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
            <input value={editor.load} onChange={(e) => onField('load', e.target.value)} type="number"
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
    </>
  );
}

export default function PlanEditor({ actions }) {
  const [planName, setPlanName] = useState('Base · Endurance');
  const [week] = useState(2);
  const [weekTitle, setWeekTitle] = useState('Aerobic base + threshold intro');
  const [targetHrs, setTargetHrs] = useState('10');
  const [targetLoad, setTargetLoad] = useState('560');
  const [focus, setFocus] = useState('Build the aerobic engine; introduce sustained threshold work midweek.');
  const [roster, setRoster] = useState(initialRoster);
  const [sessions, setSessions] = useState(initialSessions);
  const [editor, setEditor] = useState(null); // null | { id, day, sport, title, dur, load, z, note }

  // ── derived totals ──
  const totLoad = DAYS.reduce((n, d) => n + (sessions[d] || []).reduce((a, x) => a + (+x.load || 0), 0), 0);
  const totHrs = DAYS.reduce((n, d) => n + (sessions[d] || []).reduce((a, x) => a + durHours(x.dur), 0), 0);
  const sessCount = DAYS.reduce((n, d) => n + (sessions[d] || []).length, 0);
  const hrsPct = Math.min(100, Math.round(totHrs / (+targetHrs || 1) * 100));
  const loadPct = Math.min(100, Math.round(totLoad / (+targetLoad || 1) * 100));
  const assignedCount = roster.filter((a) => a.on).length;

  // ── session editing ──
  const openSession = (day, id) => {
    const sess = id ? (sessions[day] || []).find((x) => x.id === id) : null;
    setEditor(sess ? { ...sess, day } : { id: null, day, sport: 'Bike', title: '', dur: '1:00', load: 60, z: 'Zone 2', note: '' });
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
  const toggleAthlete = (id) => setRoster((r) => r.map((a) => (a.id === id ? { ...a, on: !a.on } : a)));

  return (
    <>
      <div style={s('padding:6px 18px 40px;animation:floatUp .35s ease')}>
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
        <div style={s('font-size:11.5px;color:var(--accent);font-weight:700;margin-bottom:4px')}>Kaza Tri Club · 12-week block</div>

        {/* week meta: title + targets + focus */}
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 15px;margin-top:12px')}>
          <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:9px')}>
            <span style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:700')}>Week {week} of 12</span>
            <div style={s('display:flex;gap:6px')}>
              <div className="ctl" style={s('width:26px;height:26px;border-radius:8px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text2)')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
              </div>
              <div className="ctl" style={s('width:26px;height:26px;border-radius:8px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text2)')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
              </div>
            </div>
          </div>
          <input value={weekTitle} onChange={(e) => setWeekTitle(e.target.value)} placeholder="Week title"
            style={s('width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:11px 13px;font-size:15px;font-weight:700;color:var(--text);outline:none;font-family:inherit')} />
          <div style={s('display:flex;gap:10px;margin-top:10px')}>
            <div style={s('flex:1')}>
              <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px')}>Target hours</div>
              <input value={targetHrs} onChange={(e) => setTargetHrs(e.target.value)} type="number"
                style={s('width:100%;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
            </div>
            <div style={s('flex:1')}>
              <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px')}>Target load</div>
              <input value={targetLoad} onChange={(e) => setTargetLoad(e.target.value)} type="number"
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
            <span className="mono" style={s('font-weight:700')}>{totHrs.toFixed(1)} / {targetHrs}h</span>
          </div>
          <div style={s('height:7px;border-radius:4px;background:var(--bg4);overflow:hidden')}><div style={s('height:100%;width:' + hrsPct + '%;background:var(--accent);border-radius:4px')} /></div>
          <div style={s('display:flex;justify-content:space-between;font-size:11.5px;margin:11px 0 6px')}>
            <span style={s('color:var(--text2)')}>Planned load</span>
            <span className="mono" style={s('font-weight:700')}>{totLoad} / {targetLoad}</span>
          </div>
          <div style={s('height:7px;border-radius:4px;background:var(--bg4);overflow:hidden')}><div style={s('height:100%;width:' + loadPct + '%;background:var(--bike);border-radius:4px')} /></div>
        </div>

        {/* assign athletes */}
        <div style={s('display:flex;align-items:baseline;justify-content:space-between;margin:20px 2px 10px')}>
          <span style={s('font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text2)')}>Assigned athletes</span>
          <span className="mono" style={s('font-size:12px;color:var(--accent);font-weight:700')}>{assignedCount}/{roster.length}</span>
        </div>
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
          {DAYS.map((day) => {
            const list = sessions[day] || [];
            return (
              <div key={day}>
                <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:7px')}>
                  <span style={s('font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text2)')}>{day}</span>
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
                          <div style={s('font-size:14px;font-weight:700')}>{x.title}</div>
                          <div style={s('font-size:11.5px;color:var(--text2)')}>{x.sport} · {x.z}</div>
                        </div>
                        <div style={s('text-align:right;flex:none')}>
                          <div className="mono" style={s('font-size:12.5px;font-weight:700')}>{x.dur}</div>
                          <div className="mono" style={s('font-size:10.5px;color:var(--accent)')}>{x.load} load</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="ctl" style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:14px;border-radius:14px;font-weight:700;font-size:14px;margin-top:18px')}>Publish to {assignedCount} athletes</div>
        <div style={s('text-align:center;font-size:11px;color:var(--text3);margin-top:8px;line-height:1.5')}>Assigned athletes get this week's sessions and targets, and are notified when you publish.</div>
      </div>

      {editor && <SessionSheet editor={editor} onField={editField} onSave={saveSession} onDelete={deleteSession} onClose={() => setEditor(null)} />}
    </>
  );
}
