import { s } from '../lib/style.js';
import AuthedAvatar from './AuthedAvatar.jsx';
import TileMap from './TileMap.jsx';
import { toPathD } from '../lib/tiles.js';
import useSheetDrag from '../hooks/useSheetDrag.js';

// The shared squad-event card + its supporting bits, used by both the Events screen and the
// Plan screen's group sessions so the two pages render events identically.

export const SPORTS = {
  0: { label: 'Session', color: 'var(--accent)', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  1: { label: 'Swim', color: 'var(--swim)', icon: '<path d="M2 16c1.5 0 1.5 1.5 3 1.5S8.5 16 10 16s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><path d="M2 20c1.5 0 1.5 1.5 3 1.5S8.5 20 10 20s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><circle cx="15" cy="6" r="2"/><path d="M6 13l5-4 3 2 3-3"/>' },
  2: { label: 'Ride', color: 'var(--bike)', icon: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5"/>' },
  3: { label: 'Run', color: 'var(--run)', icon: '<circle cx="14" cy="5" r="2"/><path d="M11 21l1.5-5-2.5-2 1-5 3 2 2 1M8 12l1-4 3-1"/>' },
};
export const sportMeta = (n) => SPORTS[n] || SPORTS[0];

export const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
// A route saved without a name gets an auto label like "offroad-6309302794715136" — that's a
// machine id, not a place, so don't surface it as the event's location.
export const displayPlace = (name) => {
  const n = (name || '').trim();
  return !n || /^[a-z]+-\d{4,}$/i.test(n) ? '' : n;
};
export const isTodayIso = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
};

// Turn-by-turn links to a [lat,lon] start point, one per navigation app. The rider picks
// which app to open from the Directions action sheet; each is a universal/https link so the
// OS hands it to the installed app (Waze / Google Maps / Apple Maps) or the web fallback.
export const navApps = (lat, lon) => [
  { key: 'waze', label: 'Waze', color: '#33ccff', url: `https://waze.com/ul?ll=${lat}%2C${lon}&navigate=yes` },
  { key: 'gmaps', label: 'Google Maps', color: '#34a853', url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}` },
  { key: 'amaps', label: 'Apple Maps', color: '#5a86ff', url: `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=d` },
];

// ── directions action sheet ─────────────────────────────────────────────────────────
export function DirectionsSheet({ target, onClose, onPick }) {
  const apps = navApps(target.lat, target.lon);
  const drag = useSheetDrag(onClose);
  return (
    <>
      <div className="ctl" onClick={onClose} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
      <div className="scr" style={s(`position:fixed;left:0;right:0;bottom:0;z-index:51;background:var(--bg);border-top:1px solid var(--line2);border-radius:22px 22px 0 0;padding:16px 16px calc(20px + env(safe-area-inset-bottom));animation:floatUp .22s ease;${drag.sheetStyle}`)}>
        <div {...drag.handleProps} style={s('display:flex;justify-content:center;padding:2px 0 12px;margin-top:-6px;cursor:grab;touch-action:none')}>
          <div style={s('width:38px;height:4px;border-radius:2px;background:var(--line2)')} />
        </div>
        <div style={s('font-size:15px;font-weight:700')}>Get directions</div>
        {target.title && <div style={s('font-size:12px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>to {target.title}</div>}
        <div style={s('display:flex;flex-direction:column;gap:8px;margin-top:14px')}>
          {apps.map((a) => (
            <div key={a.key} className="ctl" onClick={() => onPick(a.url)}
              style={s('display:flex;align-items:center;gap:12px;padding:12px 13px;border-radius:13px;background:var(--bg2);border:1px solid var(--line)')}>
              <div style={s(`width:34px;height:34px;flex:none;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${a.color}`)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>
              </div>
              <span style={s('flex:1;font-size:14px;font-weight:700')}>{a.label}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </div>
          ))}
        </div>
        <div className="ctl" onClick={onClose} style={s('text-align:center;margin-top:12px;padding:12px;border-radius:12px;font-size:13.5px;font-weight:700;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>Cancel</div>
      </div>
    </>
  );
}

// ── the shared event card, used by every view (Upcoming / Week / Month) so they all match:
//    date chip · type · title · when/where · route-map preview, then a who's-going + RSVP
//    footer for members, or a roster + edit/publish/delete block for the coach (squad owner). ──
export function EventCard({
  ev, isOwner, busy, token, route, participants, rosterOpen, roster, requests,
  onOpen, onDirections, onJoin, onLeave, onCheckIn, onUndoCheckIn, onApproveReq, onDeclineReq,
  onEdit, onPublish, onDelete, onRoster,
}) {
  const d = new Date(ev.start);
  const meta = sportMeta(ev.sport);
  const joined = !!ev.joined;
  const today = isTodayIso(ev.start);
  const chip = joined
    ? { bg: 'color-mix(in srgb,var(--accent) 16%,transparent)', border: 'color-mix(in srgb,var(--accent) 40%,transparent)', ink: 'var(--accent)' }
    : { bg: 'var(--bg3)', border: 'var(--line)', ink: 'var(--text)' };
  // Prefer the reverse-geocoded start-point name; fall back to a human course name (never a raw
  // GPS/auto filename, which displayPlace filters out).
  const place = ev.startPlace || displayPlace(ev.courseName);
  const start = route && route.length ? route.find((p) => Array.isArray(p) && Number.isFinite(p[0])) : null;

  const pill = 'flex:none;padding:8px 15px;border-radius:11px;font-size:12px;font-weight:700';

  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:17px;padding:13px 14px')}>
      <div className={onOpen ? 'ctl' : undefined} onClick={onOpen} style={s('display:flex;gap:13px;align-items:flex-start')}>
        {/* date chip */}
        <div style={s(`width:52px;flex:none;text-align:center;border-radius:13px;background:${chip.bg};border:1px solid ${chip.border};padding:8px 0 7px`)}>
          <div className="mono" style={s(`font-size:9px;font-weight:700;letter-spacing:1px;color:${chip.ink};text-transform:uppercase`)}>{d.toLocaleDateString('en-US', { month: 'short' })}</div>
          <div className="mono" style={s(`font-size:21px;font-weight:700;line-height:1;color:${chip.ink};margin-top:2px`)}>{String(d.getDate()).padStart(2, '0')}</div>
          <div style={s('font-size:8.5px;color:var(--text3);margin-top:3px')}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        </div>
        <div style={s('flex:1;min-width:0')}>
          <div style={s('display:flex;align-items:center;gap:7px;flex-wrap:wrap')}>
            <span style={s(`width:7px;height:7px;border-radius:50%;background:${meta.color};flex:none`)} />
            <span style={s(`font-size:9.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${meta.color}`)}>{meta.label}</span>
            {isOwner && !ev.published && (
              <span style={s('font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--warn);background:color-mix(in srgb,var(--warn) 15%,transparent);padding:2px 6px;border-radius:5px')}>Draft</span>
            )}
            {today && (
              <span style={s('font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--accent);background:var(--accent-dim);padding:2px 6px;border-radius:5px')}>Today</span>
            )}
          </div>
          <div dir="ltr" style={s('font-size:15.5px;font-weight:700;line-height:1.2;margin-top:5px;text-align:left')}>{ev.title}</div>
          <div style={s('display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--text2);margin-top:7px')}>
            <span style={s('display:flex;align-items:center;gap:5px')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              {fmtTime(ev.start)}
            </span>
            {place && (
              <span style={s('display:flex;align-items:center;gap:5px')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                {place}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* route-map preview — only when the event carries a drawable route */}
      {route && route.length > 1 && (
        <div style={s('position:relative;height:78px;border-radius:13px;overflow:hidden;margin-top:12px')}>
          <TileMap points={route} fill radius={13} pad={16}>
            {(project) => <path d={toPathD(route, project)} fill="none" stroke={meta.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          </TileMap>
          <div style={s('position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent 45%,rgba(6,8,11,.6) 100%)')} />
          {place && (
            <div style={s('position:absolute;left:9px;bottom:8px;pointer-events:none;display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:#fff')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              {place}
            </div>
          )}
          {start && (
            <div className="ctl" onClick={(e) => { e.stopPropagation(); onDirections?.(start[0], start[1]); }}
              style={s('position:absolute;right:8px;bottom:8px;display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:9px;background:rgba(20,23,29,.82);backdrop-filter:blur(6px);border:1px solid var(--line2);font-size:10px;font-weight:700;color:#fff')}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>Directions
            </div>
          )}
        </div>
      )}

      {isOwner ? (
        <>
          {/* joins / check-ins summary — tap to expand the roster */}
          <div className="ctl" onClick={onRoster}
            style={s('display:flex;align-items:center;gap:8px;margin-top:12px;padding:9px 11px;background:var(--bg3);border:1px solid var(--line);border-radius:11px')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            <span style={s('flex:1;font-size:12px;color:var(--text2);font-weight:600')}>
              <span className="mono" style={s('color:var(--text)')}>{ev.joinCount || 0}</span> joined · <span className="mono" style={s('color:var(--good)')}>{ev.checkedInCount || 0}</span> checked in
            </span>
            {requests && requests.length > 0 && (
              <span style={s('flex:none;font-size:10.5px;font-weight:700;color:var(--accent-ink);background:var(--accent);padding:2px 8px;border-radius:7px')}>{requests.length} request{requests.length > 1 ? 's' : ''}</span>
            )}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s(`transform:rotate(${rosterOpen ? 180 : 0}deg);transition:transform .15s`)}><path d="M6 9l6 6 6-6" /></svg>
          </div>

          {rosterOpen && (
            <div style={s('margin-top:8px;display:flex;flex-direction:column;gap:6px')}>
              {/* pending requests from non-members — approve or decline */}
              {requests && requests.length > 0 && (
                <>
                  <div style={s('font-size:10px;color:var(--accent);text-transform:uppercase;letter-spacing:1.2px;font-weight:700;padding:2px 2px')}>Requests to join</div>
                  {requests.map((a) => (
                    <div key={a.athleteId} style={s('display:flex;align-items:center;gap:10px;padding:7px 9px;background:color-mix(in srgb,var(--accent) 8%,var(--bg3));border:1px solid color-mix(in srgb,var(--accent) 22%,transparent);border-radius:10px')}>
                      <AuthedAvatar avatarUrl={a.avatarUrl} token={token} initials={a.initials} color={a.avatarColor} size={28} radius={9} fontSize={11} />
                      <div style={s('flex:1;min-width:0')}>
                        <div style={s('font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{a.name}</div>
                        <div style={s('font-size:9.5px;color:var(--text3)')}>not a member · wants to join</div>
                      </div>
                      <div className="ctl" onClick={() => onDeclineReq(a.athleteId)} style={s('flex:none;padding:6px 10px;border-radius:9px;font-size:11px;font-weight:700;background:color-mix(in srgb,var(--bad) 14%,var(--bg3));border:1px solid color-mix(in srgb,var(--bad) 32%,transparent);color:var(--bad)')}>Decline</div>
                      <div className="ctl" onClick={() => onApproveReq(a.athleteId)} style={s('flex:none;padding:6px 12px;border-radius:9px;font-size:11px;font-weight:700;background:var(--good);color:#04140b')}>Approve</div>
                    </div>
                  ))}
                  {roster && roster.length > 0 && <div style={s('height:2px')} />}
                </>
              )}
              {roster === null && <div style={s('font-size:11.5px;color:var(--text3);padding:6px 2px')}>Loading roster…</div>}
              {roster && roster.length === 0 && (!requests || requests.length === 0) && <div style={s('font-size:11.5px;color:var(--text3);padding:6px 2px')}>Nobody has joined yet.</div>}
              {roster && roster.map((a) => (
                <div key={a.athleteId} style={s('display:flex;align-items:center;gap:10px;padding:7px 9px;background:var(--bg3);border-radius:10px')}>
                  <AuthedAvatar avatarUrl={a.avatarUrl} token={token} initials={a.initials} color={a.avatarColor} size={28} radius={9} fontSize={11} />
                  <div style={s('flex:1;min-width:0')}>
                    <div style={s('font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{a.name}</div>
                  </div>
                  {a.checkedInUtc
                    ? <span style={s('flex:none;display:flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:var(--good)')}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                        {fmtTime(a.checkedInUtc)}
                      </span>
                    : <span style={s('flex:none;font-size:10.5px;font-weight:600;color:var(--text3)')}>Joined</span>}
                </div>
              ))}
            </div>
          )}

          {/* coach actions */}
          <div style={s('display:flex;gap:7px;margin-top:10px')}>
            <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onEdit}
              style={s('flex:1;text-align:center;padding:9px;border-radius:10px;font-size:12px;font-weight:700;background:var(--bg3);border:1px solid var(--line);color:var(--text)')}>Edit</div>
            <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onPublish}
              style={s(`flex:1;text-align:center;padding:9px;border-radius:10px;font-size:12px;font-weight:700;${ev.published ? 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)' : 'background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);color:var(--accent)'}`)}>
              {ev.published ? 'Unpublish' : 'Publish'}
            </div>
            <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onDelete}
              style={s('width:40px;flex:none;display:flex;align-items:center;justify-content:center;padding:9px;border-radius:10px;background:color-mix(in srgb,var(--bad) 12%,var(--bg3));border:1px solid color-mix(in srgb,var(--bad) 30%,transparent);color:var(--bad)')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
            </div>
          </div>
        </>
      ) : (
        /* who's going + RSVP / check-in */
        <div style={s('display:flex;align-items:center;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)')}>
          {Array.isArray(participants) && participants.length > 0 && (
            <div style={s('display:flex;align-items:center')}>
              {participants.slice(0, 3).map((p, i) => (
                <AuthedAvatar key={p.athleteId} avatarUrl={p.avatarUrl} token={token} initials={p.initials} color={p.avatarColor}
                  size={23} radius={12} fontSize={8.5} style={`border:2px solid var(--bg2)${i ? ';margin-left:-7px' : ''}`} />
              ))}
            </div>
          )}
          <span style={s('font-size:10.5px;color:var(--text3);flex:1')}>{(ev.joinCount || 0) > 0 ? `${ev.joinCount} going` : 'Be the first to RSVP'}</span>
          {ev.checkedIn ? (
            <div style={s('flex:none;display:flex;align-items:center;gap:8px')}>
              <span style={s('display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:var(--good)')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>Checked in
              </span>
              <span className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onUndoCheckIn} style={s(`font-size:11px;font-weight:600;color:var(--text3);opacity:${busy ? 0.6 : 1}`)}>{busy ? '…' : 'Undo'}</span>
            </div>
          ) : !joined ? (
            <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onJoin} style={s(`${pill};background:var(--accent);color:var(--accent-ink);opacity:${busy ? 0.6 : 1}`)}>{busy ? '…' : 'RSVP'}</div>
          ) : today ? (
            <div style={s('flex:none;display:flex;align-items:center;gap:8px')}>
              <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onCheckIn} style={s(`${pill};background:var(--good);color:#04140b;opacity:${busy ? 0.6 : 1}`)}>{busy ? '…' : 'Check in'}</div>
              <span className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onLeave} style={s('font-size:11px;font-weight:600;color:var(--text3)')}>Leave</span>
            </div>
          ) : (
            <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onLeave}
              style={s(`${pill};background:color-mix(in srgb,var(--good) 16%,transparent);border:1px solid color-mix(in srgb,var(--good) 40%,transparent);color:var(--good);opacity:${busy ? 0.6 : 1}`)}>{busy ? '…' : 'Going ✓'}</div>
          )}
        </div>
      )}
    </div>
  );
}
