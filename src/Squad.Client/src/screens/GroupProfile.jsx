import { useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import AuthedImage from '../components/AuthedImage.jsx';
import GroupTargets from '../components/GroupTargets.jsx';
import SquadEvents from '../components/SquadEvents.jsx';
import SportIcon from '../components/SportIcon.jsx';
import { familyMeta } from '../lib/disciplines.js';
import { listSquadEvents } from '../lib/events.js';

export default function GroupProfile({ vm, actions, onJoinSquad, payments, meId, getToken }) {
  const g = vm.selGroupData;
  const a = vm.applyState;
  // Live mode: real squads from the API (onJoinSquad wired). The mock apply→pay
  // state machine below is only used in the no-session prototype.
  const live = !!onJoinSquad;

  // --- hooks (always run before any early return so hook order stays stable
  //     across the null-group → loaded-group transition on boot) ---
  const [token, setToken] = useState(null);
  useEffect(() => {
    let ok = true;
    Promise.resolve(getToken?.()).then((t) => { if (ok) setToken(t || null); });
    return () => { ok = false; };
  }, [getToken]);

  // Sessions stat — the real count of the squad's scheduled group rides.
  const [sessionCount, setSessionCount] = useState(null);
  const gid = g?.id;
  useEffect(() => {
    if (!live || !gid) { setSessionCount(null); return; }
    let ok = true;
    Promise.resolve(getToken?.())
      .then((t) => listSquadEvents(t, gid))
      .then((evs) => { if (ok) setSessionCount(Array.isArray(evs) ? evs.length : 0); })
      .catch(() => { if (ok) setSessionCount(0); });
    return () => { ok = false; };
  }, [live, gid, getToken]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const join = async () => {
    setError(''); setBusy(true);
    try {
      await onJoinSquad(g.id);
      // Every club is gated now — joining creates a request; stay put to show "pending".
    } catch (e) { setError(e.message || 'Could not send your request.'); }
    finally { setBusy(false); }
  };

  // On boot the app can restore this screen before the squad list has loaded (or the
  // selected id may not be in it), leaving no group to render. Show a placeholder
  // rather than dereferencing an undefined group (which white-screened the whole app).
  if (!g) {
    return (
      <div style={s('padding:6px 0 120px;animation:floatUp .35s ease')}>
        <div style={s('text-align:center;color:var(--text3);font-size:13px;margin-top:64px')}>Loading group…</div>
      </div>
    );
  }

  const isOwner = live && !!meId && !!g.owner && String(g.owner).toLowerCase() === String(meId).toLowerCase();
  const fam = familyMeta(g.disc);
  const accent = fam.accent;                       // discipline-family accent (endurance orange / motorsport purple)
  const rating = g.rating && g.rating !== '—' ? g.rating : 'New';
  const desc = g.description || g.desc;
  const locLine = [g.loc, g.disc, g.level].filter(Boolean).join(' · ');

  // A soft, discipline-tinted chip (background + border derived from the family accent).
  const tint = (pct) => `color-mix(in srgb,${accent} ${pct}%,transparent)`;

  return (
    <div style={s('padding:4px 16px 128px;animation:floatUp .35s ease')}>

      {/* hero cover — uploaded image when set, else the discipline-tinted gradient */}
      <div style={s(`position:relative;height:172px;border-radius:20px;overflow:hidden;background:linear-gradient(135deg,${g.color},color-mix(in srgb,${g.color} 40%, var(--bg3)))`)}>
        {g.bannerUrl
          ? <AuthedImage url={g.bannerUrl} token={token} style="position:absolute;inset:0;width:100%;height:100%" />
          : (
            <div style={s('position:absolute;right:-8px;bottom:-18px;opacity:.22')}>
              <SportIcon name={fam.glyph} size={150} color="#0c0e11" strokeWidth={1.5} />
            </div>
          )}
        <div style={s('position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,rgba(6,8,11,.55) 100%);pointer-events:none')} />
      </div>

      {/* identity — logo overlaps the cover, discipline pill to its right */}
      <div style={s('display:flex;align-items:flex-end;gap:13px;margin:-34px 4px 0;position:relative;z-index:2')}>
        <div style={s('width:72px;height:72px;flex:none;border-radius:20px;overflow:hidden;background:var(--bg3);border:3px solid var(--bg);box-shadow:0 10px 24px -10px rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center')}>
          {g.logoUrl
            ? <AuthedImage url={g.logoUrl} token={token} style="width:100%;height:100%;object-fit:cover" />
            : <SportIcon name={fam.glyph} size={34} color={accent} strokeWidth={1.8} />}
        </div>
        <div style={s('flex:1;padding-bottom:4px')}>
          <div style={s(`display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:7px;background:${tint(20)};border:1px solid ${tint(40)}`)}>
            <span style={s(`width:6px;height:6px;border-radius:50%;background:${accent}`)} />
            <span style={s(`font-size:9.5px;font-weight:700;letter-spacing:1px;color:${accent}`)}>{fam.label.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* title + location line */}
      <div style={s('margin-top:12px')}>
        <div style={s('font-size:24px;font-weight:700;letter-spacing:-.5px;line-height:1.1')}>{g.name}</div>
        {locLine && (
          <div style={s('display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text2);margin-top:6px')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            <span>{locLine}</span>
          </div>
        )}
      </div>

      {/* stats — rating / riders / sessions */}
      <div style={s('display:flex;gap:9px;margin-top:16px')}>
        <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:15px;padding:13px 14px')}>
          <div style={s('display:flex;align-items:center;gap:6px')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)" stroke="none"><path d="M12 2l3 6.5 7 .8-5.2 4.7L18.2 22 12 18.3 5.8 22l1.4-8L2 9.3l7-.8z" /></svg>
            <span className="mono" style={s('font-size:20px;font-weight:700')}>{rating}</span>
          </div>
          <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-top:4px')}>Rating</div>
        </div>
        <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:15px;padding:13px 14px')}>
          <div className="mono" style={s('font-size:20px;font-weight:700')}>{g.members ?? 0}</div>
          <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-top:4px')}>Riders</div>
        </div>
        <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:15px;padding:13px 14px')}>
          <div className="mono" style={s('font-size:20px;font-weight:700')}>{sessionCount ?? '—'}</div>
          <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-top:4px')}>Sessions</div>
        </div>
      </div>

      {/* member status (member only) */}
      {live && g.member && (
        <div style={s('display:flex;align-items:center;gap:12px;background:color-mix(in srgb,var(--good) 11%,var(--bg2));border:1px solid color-mix(in srgb,var(--good) 32%,transparent);border-radius:16px;padding:13px 15px;margin-top:11px')}>
          <div style={s('width:38px;height:38px;flex:none;border-radius:12px;background:color-mix(in srgb,var(--good) 20%,transparent);display:flex;align-items:center;justify-content:center')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <div style={s('flex:1')}>
            <div style={s('font-size:14px;font-weight:700;color:var(--good)')}>You're a member</div>
            <div style={s('font-size:11.5px;color:var(--text2);margin-top:1px')}>This is your active squad — feed &amp; ranks are on your dashboard.</div>
          </div>
        </div>
      )}

      {/* description */}
      {desc && <div style={s('font-size:12.5px;color:var(--text2);line-height:1.5;margin-top:11px')}>{desc}</div>}

      {/* message the squad */}
      <div className="ctl" onClick={() => actions.go('chat')} style={s('display:flex;align-items:center;gap:13px;background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 15px;margin-top:11px')}>
        <div style={s('width:40px;height:40px;flex:none;border-radius:12px;background:var(--accent);display:flex;align-items:center;justify-content:center')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12 7.7L3 21l1.8-6A8.5 8.5 0 1 1 21 11.5z" /></svg>
        </div>
        <div style={s('flex:1')}><div style={s('font-size:14px;font-weight:700')}>Message the squad</div><div style={s('font-size:11.5px;color:var(--text2);margin-top:1px')}>Ask about training, pace and joining</div></div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </div>

      {/* membership & services */}
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin:22px 2px 10px')}>
        <span style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Membership</span>
        {!live && <span style={s('font-size:10px;color:var(--text3)')}>{vm.tierOpenNote}</span>}
      </div>
      <div style={s('display:flex;flex-direction:column;gap:9px')}>
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 15px;display:flex;align-items:center;gap:12px')}>
          <div style={s('width:40px;height:40px;flex:none;border-radius:12px;background:var(--bg3);display:flex;align-items:center;justify-content:center')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-6 9 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 21V12h6v9" /></svg>
          </div>
          <div style={s('flex:1')}><div style={s('font-size:14px;font-weight:700')}>Full access</div><div style={s('font-size:11.5px;color:var(--text2);margin-top:1px')}>All group rides &amp; plan</div></div>
          <div style={s('text-align:right')}>
            <div className="mono" style={s(`font-size:17px;font-weight:700;${g.member ? 'color:var(--good)' : ''}`)}>{g.price}<span style={s('font-size:11px;color:var(--text2)')}>{g.per}</span></div>
            {g.member && <div style={s('font-size:9.5px;color:var(--text3);margin-top:2px')}>Active</div>}
          </div>
        </div>
        {!live && (
          <>
            <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 15px;display:flex;align-items:center;gap:12px')}>
              <div style={s('flex:1')}><div style={s('font-size:14px;font-weight:700')}>One-time group ride</div><div style={s('font-size:11.5px;color:var(--text2)')}>Drop in for a single session</div></div>
              <div style={s('text-align:right')}><div className="mono" style={s('font-size:16px;font-weight:700')}>₪35</div></div>
            </div>
            <div style={s('background:var(--bg2);border:1px solid color-mix(in srgb,var(--gym) 30%,transparent);border-radius:16px;padding:14px 15px;display:flex;align-items:center;gap:12px')}>
              <div style={s('flex:1')}><div style={s('font-size:14px;font-weight:700')}>1:1 Coaching</div><div style={s('font-size:11.5px;color:var(--text2)')}>Personalised plan + weekly review</div></div>
              <div style={s('text-align:right')}><div className="mono" style={s('font-size:16px;font-weight:700')}>₪450<span style={s('font-size:11px;color:var(--text2)')}>/mo</span></div></div>
            </div>
          </>
        )}
      </div>

      {/* live join / request / membership status */}
      {live && !g.member && (() => {
        const gated = true; // every club is approval/invitation-gated — no instant join
        if (g.requestStatus === 'pending') return (
          <div style={s('background:color-mix(in srgb,var(--warn) 14%,var(--bg2));border:1px solid color-mix(in srgb,var(--warn) 35%,transparent);border-radius:13px;padding:12px 14px;margin-top:16px;font-size:12.5px;color:var(--text2)')}><span style={s('color:var(--warn);font-weight:700')}>Request pending.</span> The squad manager is reviewing your application.</div>
        );
        return (
          <>
            {gated && g.requestStatus === 'declined' && <div style={s('font-size:12px;color:var(--bad);text-align:center;margin-top:16px')}>Your previous request was declined — you can apply again.</div>}
            <div className="ctl" onClick={busy ? undefined : join} style={s(`background:var(--accent);color:var(--accent-ink);text-align:center;padding:14px;border-radius:14px;font-weight:700;font-size:14px;margin-top:${gated && g.requestStatus === 'declined' ? '8' : '16'}px;${busy ? 'opacity:.6' : ''}`)}>{busy ? 'Sending…' : (gated ? 'Request to join' : 'Join this squad')}</div>
            {error && <div style={s('color:var(--bad);font-size:12px;text-align:center;margin-top:8px')}>{error}</div>}
            <div style={s('font-size:11px;color:var(--text3);text-align:center;margin-top:8px;line-height:1.4')}>{gated ? 'The manager reviews your training records before you join.' : 'Joining makes this your active squad — its rides, feed and leaderboard become yours.'}</div>
          </>
        );
      })()}

      {/* owner: manage the group page (branding, details, pricing, members) */}
      {live && isOwner && (
        <div className="ctl" onClick={actions.openManage} style={s('display:flex;align-items:center;gap:11px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px;margin-top:12px')}>
          <div style={s('width:36px;height:36px;border-radius:11px;background:var(--accent-dim);flex:none;display:flex;align-items:center;justify-content:center')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </div>
          <div style={s('flex:1')}><div style={s('font-size:13px;font-weight:700')}>Manage group</div><div style={s('font-size:11px;color:var(--text2)')}>Logo, banner, details, pricing &amp; members</div></div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
        </div>
      )}

      {/* ride-payment ledger entry points (live) */}
      {live && payments && isOwner && (
        <div className="ctl" onClick={actions.openLedger} style={s('display:flex;align-items:center;gap:11px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px;margin-top:12px')}>
          <div style={s('width:36px;height:36px;border-radius:11px;background:var(--accent-dim);flex:none;display:flex;align-items:center;justify-content:center')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><path d="M3 10h18M7 15h4" /><rect x="3" y="5" width="18" height="14" rx="2.5" /></svg>
          </div>
          <div style={s('flex:1')}><div style={s('font-size:13px;font-weight:700')}>Manage ride payments</div><div style={s('font-size:11px;color:var(--text2)')}>Ledger, club cut &amp; what's outstanding</div></div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
        </div>
      )}

      {/* group sessions — only surface publicly-joinable rides: a free/open group (anyone can
          join), or when the viewer is already a member / the owner. A gated or paid group's
          sessions stay hidden from non-members (they must join the group first). */}
      {live && (g.member || isOwner) && (
        <SquadEvents squadId={g.id} getToken={getToken} mode="browse" disc={g.disc} onOpen={(ev) => actions.openEvent(ev)} />
      )}

      {/* group target races — members can add one to their own goals */}
      {live && <GroupTargets squadId={g.id} getToken={getToken} mode="adopt" />}

      {/* apply / status (mock prototype only) */}
      {!live && a.notApplied && (
        <>
          <div className="ctl" onClick={actions.applyJoin} style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:14px;border-radius:14px;font-weight:700;font-size:14px;margin-top:16px')}>Apply to join</div>
          <div style={s('font-size:11px;color:var(--text3);text-align:center;margin-top:8px;line-height:1.4')}>The manager reviews your training history and records before you pay or join a ride.</div>
        </>
      )}
      {a.applied && (
        <>
          <div style={s('background:color-mix(in srgb,var(--warn) 14%,var(--bg2));border:1px solid color-mix(in srgb,var(--warn) 35%,transparent);border-radius:13px;padding:13px 14px;margin-top:16px;display:flex;gap:10px;align-items:flex-start')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            <div style={s('font-size:12.5px;color:var(--text2);line-height:1.45')}><span style={s('color:var(--warn);font-weight:700')}>Application under review.</span> The manager is checking your records to confirm you're a fit for the group's pace.</div>
          </div>
          <div className="ctl" onClick={actions.simulateApprove} style={s('text-align:center;font-size:11px;font-weight:600;color:var(--text3);margin-top:10px')}>Simulate manager approval →</div>
        </>
      )}
      {a.approvedPaid && (
        <div style={s('background:color-mix(in srgb,var(--good) 14%,var(--bg2));border:1px solid color-mix(in srgb,var(--good) 35%,transparent);border-radius:13px;padding:13px 14px;margin-top:16px;font-size:12.5px;color:var(--text2)')}><span style={s('color:var(--good);font-weight:700')}>You're approved! 🎉</span> Arrange payment with the group's coach directly — they'll confirm your membership.</div>
      )}
      {a.approvedFree && (
        <div className="ctl" onClick={actions.freeJoin} style={s('background:var(--good);color:#04140b;text-align:center;padding:14px;border-radius:14px;font-weight:700;font-size:14px;margin-top:16px')}>Approved — join for free</div>
      )}
      {a.paid && (
        <div style={s('background:color-mix(in srgb,var(--good) 14%,var(--bg2));border:1px solid color-mix(in srgb,var(--good) 35%,transparent);border-radius:13px;padding:12px 14px;margin-top:16px;font-size:12.5px;color:var(--text2)')}><span style={s('color:var(--good);font-weight:700')}>Membership active.</span> Welcome to the squad — see you on the next ride.</div>
      )}
    </div>
  );
}
