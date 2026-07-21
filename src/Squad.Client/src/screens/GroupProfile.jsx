import { useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import AuthedImage from '../components/AuthedImage.jsx';

const Back = ({ onClick }) => (
  <div className="ctl" onClick={onClick} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
  </div>
);

export default function GroupProfile({ vm, actions, onJoinSquad, payments, meId, getToken }) {
  const g = vm.selGroupData;
  const a = vm.applyState;
  // Live mode: real squads from the API (onJoinSquad wired). The mock apply→pay
  // state machine below is only used in the no-session prototype.
  const live = !!onJoinSquad;

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
  const [token, setToken] = useState(null);
  useEffect(() => {
    let ok = true;
    Promise.resolve(getToken?.()).then((t) => { if (ok) setToken(t || null); });
    return () => { ok = false; };
  }, [getToken]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const join = async () => {
    setError(''); setBusy(true);
    try {
      await onJoinSquad(g.id);
      // Free squads land you in the app; gated squads stay put to show "pending".
      if (g.kind === 'free') actions.go('dash');
    } catch (e) { setError(e.message || 'Could not join.'); }
    finally { setBusy(false); }
  };
  return (
    <div style={s('padding:6px 0 120px;animation:floatUp .35s ease')}>
      {/* back now in the global app header */}

      {/* banner — uploaded image when set, else the discipline-tinted gradient */}
      <div style={s(`margin:12px 18px 0;height:96px;border-radius:18px;background:linear-gradient(135deg,${g.color},color-mix(in srgb,${g.color} 40%, var(--bg3)));position:relative;overflow:hidden`)}>
        {g.bannerUrl
          ? <AuthedImage url={g.bannerUrl} token={token} style="position:absolute;inset:0;width:100%;height:100%" />
          : (
            <div style={s('position:absolute;right:-10px;bottom:-16px;opacity:.25')}>
              <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#0c0e11" strokeWidth="1.6"><circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" /><path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5" /></svg>
            </div>
          )}
        {g.logoUrl && (
          <AuthedImage url={g.logoUrl} token={token} style="position:absolute;left:12px;bottom:12px;width:48px;height:48px;border-radius:13px;border:2px solid var(--bg2);box-shadow:0 2px 8px rgba(0,0,0,.35)" />
        )}
      </div>

      <div style={s('padding:14px 18px 0')}>
        <div style={s('font-size:22px;font-weight:700;letter-spacing:-.4px')}>{g.name}</div>
        <div style={s('font-size:12.5px;color:var(--text2);margin-top:2px')}>{g.loc} · {g.disc} · {g.level}</div>
        <div style={s('display:flex;gap:16px;margin-top:12px')}>
          {g.rating && <div><div className="mono" style={s('font-size:18px;font-weight:700')}>★ {g.rating}</div><div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase')}>Rating</div></div>}
          <div><div className="mono" style={s('font-size:18px;font-weight:700')}>{g.members ?? 0}</div><div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase')}>Riders</div></div>
        </div>
        {g.desc && <div style={s('font-size:12.5px;color:var(--text2);line-height:1.5;margin-top:14px')}>{g.desc}</div>}

        {/* message the squad */}
        <div className="ctl" onClick={() => actions.go('chat')} style={s('display:flex;align-items:center;gap:11px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px;margin-top:14px')}>
          <div style={s('width:36px;height:36px;border-radius:11px;background:var(--bg4);flex:none;display:flex;align-items:center;justify-content:center')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.5 8.5 0 0 1-12 7.7L3 21l1.8-6A8.5 8.5 0 1 1 21 11.5z" /></svg>
          </div>
          <div style={s('flex:1')}><div style={s('font-size:13px;font-weight:600')}>Message the squad</div><div style={s('font-size:11px;color:var(--text2)')}>Ask about training, pace and joining</div></div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
        </div>

        {/* membership & services */}
        <div style={s('display:flex;align-items:center;justify-content:space-between;margin:20px 0 10px')}><span style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600')}>Membership &amp; services</span><span style={s('font-size:10px;color:var(--text3)')}>{live ? '' : vm.tierOpenNote}</span></div>
        <div style={s('display:flex;flex-direction:column;gap:9px')}>
          <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px;display:flex;align-items:center;gap:12px')}>
            <div style={s('flex:1')}><div style={s('font-size:14px;font-weight:700')}>Membership</div><div style={s('font-size:11.5px;color:var(--text2)')}>Full access · all group rides &amp; plan</div></div>
            <div style={s('text-align:right')}><div className="mono" style={s('font-size:16px;font-weight:700')}>{g.price}<span style={s('font-size:11px;color:var(--text2)')}>{g.per}</span></div>{!live && <div className="ctl" onClick={actions.payMember} style={s(a.joinBtnStyle)}>Join {a.tierLabel}</div>}</div>
          </div>
          {!live && (
            <>
              <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px;display:flex;align-items:center;gap:12px')}>
                <div style={s('flex:1')}><div style={s('font-size:14px;font-weight:700')}>One-time group ride</div><div style={s('font-size:11.5px;color:var(--text2)')}>Drop in for a single session</div></div>
                <div style={s('text-align:right')}><div className="mono" style={s('font-size:16px;font-weight:700')}>₪35</div><div className="ctl" onClick={actions.payDropin} style={s(a.bookBtnStyle)}>Book {a.tierLabel}</div></div>
              </div>
              <div style={s('background:var(--bg2);border:1px solid color-mix(in srgb,var(--gym) 30%,transparent);border-radius:14px;padding:13px 14px;display:flex;align-items:center;gap:12px')}>
                <div style={s('flex:1')}><div style={s('font-size:14px;font-weight:700')}>1:1 Coaching</div><div style={s('font-size:11.5px;color:var(--text2)')}>Personalised plan + weekly review</div></div>
                <div style={s('text-align:right')}><div className="mono" style={s('font-size:16px;font-weight:700')}>₪450<span style={s('font-size:11px;color:var(--text2)')}>/mo</span></div><div className="ctl" onClick={actions.payCoach} style={s(a.coachBtnStyle)}>Enquire {a.tierLabel}</div></div>
              </div>
            </>
          )}
        </div>

        {/* live join / request / membership status */}
        {live && (() => {
          const gated = g.kind !== 'free';
          if (g.member) return (
            <div style={s('background:color-mix(in srgb,var(--good) 14%,var(--bg2));border:1px solid color-mix(in srgb,var(--good) 35%,transparent);border-radius:13px;padding:12px 14px;margin-top:16px;font-size:12.5px;color:var(--text2)')}><span style={s('color:var(--good);font-weight:700')}>You're a member.</span> This is your active squad — its feed &amp; leaderboard are on your dashboard.</div>
          );
          if (gated && g.requestStatus === 'pending') return (
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
        {live && payments && !isOwner && (
          <div className="ctl" onClick={actions.openRecordPay} style={s('display:flex;align-items:center;gap:11px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px;margin-top:12px')}>
            <div style={s('width:36px;height:36px;border-radius:11px;background:var(--bg4);flex:none;display:flex;align-items:center;justify-content:center')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18" /></svg>
            </div>
            <div style={s('flex:1')}><div style={s('font-size:13px;font-weight:700')}>Record a payment</div><div style={s('font-size:11px;color:var(--text2)')}>Log what you paid the coach for a ride</div></div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
          </div>
        )}

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
          <div style={s('background:color-mix(in srgb,var(--good) 14%,var(--bg2));border:1px solid color-mix(in srgb,var(--good) 35%,transparent);border-radius:13px;padding:13px 14px;margin-top:16px;font-size:12.5px;color:var(--text2)')}><span style={s('color:var(--good);font-weight:700')}>You're approved! 🎉</span> Choose a plan above to complete payment and join the squad.</div>
        )}
        {a.approvedFree && (
          <div className="ctl" onClick={actions.freeJoin} style={s('background:var(--good);color:#04140b;text-align:center;padding:14px;border-radius:14px;font-weight:700;font-size:14px;margin-top:16px')}>Approved — join for free</div>
        )}
        {a.paid && (
          <div style={s('background:color-mix(in srgb,var(--good) 14%,var(--bg2));border:1px solid color-mix(in srgb,var(--good) 35%,transparent);border-radius:13px;padding:12px 14px;margin-top:16px;font-size:12.5px;color:var(--text2)')}><span style={s('color:var(--good);font-weight:700')}>Membership active.</span> Welcome to the squad — see you on the next ride.</div>
        )}
      </div>
    </div>
  );
}
