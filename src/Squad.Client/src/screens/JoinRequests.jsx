import { s } from '../lib/style.js';
import { useJoinRequests } from '../hooks/useJoinRequests.js';

// Real coach view: pending join requests across the caller's squads, approve/decline inline.
function LiveRequests({ getToken, actions }) {
  const { items, approve, decline } = useJoinRequests({ getToken, enabled: !!getToken });
  return (
    <>
      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Coach · manager</div>
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin-top:2px')}>
        <div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px')}>Join Requests</div>
        <div style={s('background:var(--accent);color:var(--accent-ink);font-size:12px;font-weight:700;padding:4px 10px;border-radius:9px')}><span className="mono">{items.length}</span> pending</div>
      </div>
      {items.length === 0 ? (
        <div style={s('font-size:12.5px;color:var(--text3);background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:22px;text-align:center;margin-top:16px')}>No pending requests. When athletes apply to your squads, they'll appear here.</div>
      ) : (
        <div style={s('display:flex;flex-direction:column;gap:11px;margin-top:16px')}>
          {items.map((a) => (
            <div key={a.squadId + a.athleteId} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px')}>
              <div style={s('display:flex;gap:12px;align-items:center')}>
                <div className="ctl" onClick={() => actions.openAthlete(a.athleteId)} style={s(`width:44px;height:44px;border-radius:13px;background:${a.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#0c0e11`)}>{a.initials}</div>
                <div style={s('flex:1;min-width:0')}><div style={s('font-size:14.5px;font-weight:700')}>{a.name}</div><div style={s('font-size:11px;color:var(--text3)')}>applied {a.when} · {a.squadName}</div></div>
                <div style={s('text-align:right')}><div className="mono" style={s('font-size:14px;font-weight:700')}>{a.ftp}<span style={s('font-size:9px;color:var(--text2)')}>w</span></div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase')}>FTP · {a.weekly}</div></div>
              </div>
              <div style={s('display:flex;gap:9px;margin-top:12px')}>
                <div className="ctl" onClick={() => decline(a.squadId, a.athleteId)} style={s('flex:1;background:color-mix(in srgb,var(--bad) 14%,var(--bg2));border:1px solid color-mix(in srgb,var(--bad) 35%,transparent);color:var(--bad);text-align:center;padding:11px;border-radius:12px;font-weight:700;font-size:13px')}>Decline</div>
                <div className="ctl" onClick={() => approve(a.squadId, a.athleteId)} style={s('flex:1;background:var(--good);color:#04140b;text-align:center;padding:11px;border-radius:12px;font-weight:700;font-size:13px')}>Approve</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const statTiles = [
  ['ftp', 'FTP w'], ['wkg', 'W/kg'], ['weekly', 'Weekly'],
  ['longest', 'Longest'], ['css', 'Swim CSS'], ['streak', 'Streak', 'd'],
];

function ApplicantList({ vm, actions }) {
  return (
    <>
      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Coach · manager</div>
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin-top:2px')}>
        <div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px')}>Join Requests</div>
        <div style={s('background:var(--accent);color:var(--accent-ink);font-size:12px;font-weight:700;padding:4px 10px;border-radius:9px')}><span className="mono">{vm.pendingCount}</span> pending</div>
      </div>
      <div style={s('display:flex;flex-direction:column;gap:11px;margin-top:16px')}>
        {vm.applicantList.map((a) => (
          <div key={a.id} className="ctl" onClick={() => actions.openApplicant(a.id)} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px')}>
            <div style={s('display:flex;gap:12px;align-items:center')}>
              <div style={s(`width:44px;height:44px;border-radius:13px;background:${a.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#0c0e11`)}>{a.initials}</div>
              <div style={s('flex:1;min-width:0')}><div style={s('font-size:14.5px;font-weight:700')}>{a.name}</div><div style={s('font-size:11px;color:var(--text3)')}>applied {a.when}</div></div>
              <span style={s(`font-size:10px;font-weight:700;padding:3px 8px;border-radius:7px;color:${a.fitColor};background:${a.fitBg}`)}>{a.fit}</span>
            </div>
            <div style={s('display:flex;margin-top:12px;border-top:1px solid var(--line);padding-top:11px')}>
              <div style={s('flex:1')}><div className="mono" style={s('font-size:15px;font-weight:700')}>{a.ftp}<span style={s('font-size:9px;color:var(--text2)')}>w</span></div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase')}>FTP</div></div>
              <div style={s('flex:1;border-left:1px solid var(--line);padding-left:10px')}><div className="mono" style={s('font-size:15px;font-weight:700')}>{a.weekly}</div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase')}>Weekly</div></div>
              <div style={s('flex:1;border-left:1px solid var(--line);padding-left:10px')}><div className="mono" style={s('font-size:15px;font-weight:700')}>{a.streak}<span style={s('font-size:9px;color:var(--text2)')}>d</span></div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase')}>Streak</div></div>
              <div style={s('flex:none;display:flex;align-items:center')}><span style={s(`font-size:10px;font-weight:700;color:${a.statusColor}`)}>{a.statusLabel}</span></div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ApplicantDetail({ vm, actions }) {
  const a = vm.selApplicant;
  return (
    <>
      <div style={s('display:flex;align-items:center;gap:10px')}>
        <div className="ctl" onClick={actions.closeApplicant} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
        </div>
        <div style={s('font-size:13px;color:var(--text3);font-weight:600')}>Review applicant</div>
      </div>
      <div style={s('display:flex;gap:13px;align-items:center;margin-top:14px')}>
        <div style={s(`width:56px;height:56px;border-radius:16px;background:${a.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#0c0e11`)}>{a.initials}</div>
        <div style={s('flex:1')}><div style={s('font-size:19px;font-weight:700')}>{a.name}</div><div style={s('font-size:12px;color:var(--text2)')}>applied {a.when} · {a.races} races logged</div></div>
      </div>
      <div style={s(`background:${a.fitBg};border:1px solid ${a.fitColor};border-radius:14px;padding:12px 14px;margin-top:14px`)}>
        <div style={s(`font-size:13px;font-weight:700;color:${a.fitColor}`)}>AI fitness check · {a.fit}</div>
        <div style={s('font-size:12px;color:var(--text2);margin-top:3px;line-height:1.45')}>{a.note}</div>
      </div>
      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600;margin:18px 0 10px')}>Records &amp; history</div>
      <div style={s('display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px')}>
        {statTiles.map(([key, lbl, unit]) => (
          <div key={key} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:11px 12px')}>
            <div className="mono" style={s('font-size:18px;font-weight:700')}>{a[key]}{unit && <span style={s('font-size:10px;color:var(--text2)')}>{unit}</span>}</div>
            <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase')}>{lbl}</div>
          </div>
        ))}
      </div>
      {a.decided && (
        <div style={s(`text-align:center;font-size:14px;font-weight:700;color:${a.fitColor};margin-top:18px;padding:13px;background:var(--bg2);border:1px solid var(--line);border-radius:13px`)}>Request {a.statusLabel}</div>
      )}
      {vm.applicantPending && (
        <>
          <div className="ctl" onClick={() => actions.go('chat')} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:12px;text-align:center;font-size:13px;font-weight:700;margin-top:18px;display:flex;align-items:center;justify-content:center;gap:8px')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.5 8.5 0 0 1-12 7.7L3 21l1.8-6A8.5 8.5 0 1 1 21 11.5z" /></svg>Message athlete
          </div>
          <div style={s('display:flex;gap:9px;margin-top:9px')}>
            <div className="ctl" onClick={actions.decline} style={s('flex:1;background:color-mix(in srgb,var(--bad) 14%,var(--bg2));border:1px solid color-mix(in srgb,var(--bad) 35%,transparent);color:var(--bad);text-align:center;padding:14px;border-radius:13px;font-weight:700;font-size:14px')}>Decline</div>
            <div className="ctl" onClick={actions.approve} style={s('flex:1;background:var(--good);color:#04140b;text-align:center;padding:14px;border-radius:13px;font-weight:700;font-size:14px')}>Approve</div>
          </div>
        </>
      )}
    </>
  );
}

export default function JoinRequests({ vm, actions, getToken }) {
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {getToken
        ? <LiveRequests getToken={getToken} actions={actions} />
        : vm.applicantOpen && vm.selApplicant
          ? <ApplicantDetail vm={vm} actions={actions} />
          : <ApplicantList vm={vm} actions={actions} />}
    </div>
  );
}
