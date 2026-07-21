import { useState } from 'react';
import { s } from '../lib/style.js';
import { formatMinor } from '../lib/payments.js';
import { useSquadLedger } from '../hooks/usePayments.js';

const Back = ({ onClick }) => (
  <div className="ctl" onClick={onClick} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
  </div>
);

const KIND_LABEL = { member: 'Membership', dropin: 'Drop-in ride', coach: 'Coaching' };
const METHODS = [
  { key: 'etransfer', label: 'E-transfer' },
  { key: 'cash', label: 'Cash' },
  { key: 'link', label: 'Link' },
  { key: 'other', label: 'Other' },
];
const STATUS_STYLE = {
  paid: 'color:var(--good);background:color-mix(in srgb,var(--good) 15%,transparent)',
  owed: 'color:var(--warn);background:color-mix(in srgb,var(--warn) 15%,transparent)',
  waived: 'color:var(--text3);background:var(--bg4)',
};

const Tile = ({ label, value, accent }) => (
  <div style={s('flex:1;min-width:0;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px')}>
    <div className="mono" style={s(`font-size:18px;font-weight:700;${accent ? `color:${accent}` : ''}`)}>{value}</div>
    <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-top:3px')}>{label}</div>
  </div>
);

export default function CoachLedger({ vm, actions, payments, getToken }) {
  const g = vm.selGroupData || {};
  const { rows, summary, status, refetch } = useSquadLedger({ getToken, squadId: g.id });
  const [openMethodFor, setOpenMethodFor] = useState(null); // payment id showing method chips
  const cur = summary?.currency || 'ILS';

  const markPaid = async (id, method) => {
    setOpenMethodFor(null);
    await payments.onMarkPaid(id, method, null);
    await refetch();
  };
  const waive = async (id) => {
    await payments.onWaivePayment(id, null);
    await refetch();
  };

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* title + back now in the global app header */}
      {g.name && <div style={s('font-size:12px;color:var(--text2)')}>{g.name}</div>}

      {/* totals */}
      {summary && (
        <>
          <div style={s('display:flex;gap:9px;margin-top:16px')}>
            <Tile label="Collected" value={formatMinor(summary.collectedMinor, cur)} accent="var(--good)" />
            <Tile label="Outstanding" value={formatMinor(summary.outstandingMinor, cur)} accent="var(--warn)" />
          </div>
          <div style={s('display:flex;gap:9px;margin-top:9px')}>
            <Tile label="Coach net" value={formatMinor(summary.coachNetMinor, cur)} />
            <Tile label="Club cut" value={formatMinor(summary.clubCutMinor, cur)} accent="var(--accent)" />
          </div>
          <div style={s('font-size:11px;color:var(--text3);line-height:1.5;margin-top:10px')}>Club cut is booked on collected payments only — reconcile it with the coach. Money is collected out-of-band; this is a tracking ledger.</div>
        </>
      )}

      {status === 'error' && <div style={s('color:var(--bad);font-size:13px;text-align:center;margin-top:24px')}>You don't manage this squad, or the ledger couldn't load.</div>}
      {status === 'ready' && rows.length === 0 && <div style={s('color:var(--text3);font-size:13px;text-align:center;margin-top:28px')}>No payments recorded yet.</div>}

      {/* rows */}
      <div style={s('display:flex;flex-direction:column;gap:9px;margin-top:16px')}>
        {rows.map((p) => (
          <div key={p.id} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px')}>
            <div style={s('display:flex;align-items:center;gap:11px')}>
              <div style={s(`width:34px;height:34px;border-radius:10px;flex:none;background:${p.payerAvatarColor || 'var(--bg4)'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#0c0e11`)}>{p.payerInitials}</div>
              <div style={s('flex:1;min-width:0')}>
                <div style={s('font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{p.payerName}</div>
                <div style={s('font-size:11px;color:var(--text2)')}>{KIND_LABEL[p.kind] || p.kind}{p.method ? ` · ${p.method}` : ''}</div>
              </div>
              <div style={s('text-align:right')}>
                <div className="mono" style={s('font-size:15px;font-weight:700')}>{formatMinor(p.amountMinor, p.currency)}</div>
                <span style={s(`font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:2px 7px;border-radius:6px;${STATUS_STYLE[p.status] || ''}`)}>{p.status}</span>
              </div>
            </div>

            {/* club-cut breakdown */}
            <div style={s('display:flex;gap:14px;margin-top:9px;padding-top:9px;border-top:1px solid var(--line)')}>
              <div style={s('font-size:11px;color:var(--text3)')}>Coach <span className="mono" style={s('color:var(--text)')}>{formatMinor(p.coachNetMinor, p.currency)}</span></div>
              <div style={s('font-size:11px;color:var(--text3)')}>Club <span className="mono" style={s('color:var(--accent)')}>{formatMinor(p.clubCutMinor, p.currency)}</span> <span style={s('opacity:.6')}>({(p.clubFeeBps / 100).toFixed(p.clubFeeBps % 100 ? 1 : 0)}%)</span></div>
            </div>

            {/* actions on unsettled rows */}
            {p.status === 'owed' && (
              openMethodFor === p.id ? (
                <div style={s('display:flex;flex-wrap:wrap;gap:7px;margin-top:10px')}>
                  {METHODS.map((m) => (
                    <div key={m.key} className="ctl" onClick={() => markPaid(p.id, m.key)} style={s('padding:7px 11px;border-radius:9px;font-size:12px;font-weight:600;border:1px solid var(--accent);background:var(--accent-dim);color:var(--accent)')}>{m.label}</div>
                  ))}
                  <div className="ctl" onClick={() => setOpenMethodFor(null)} style={s('padding:7px 11px;border-radius:9px;font-size:12px;font-weight:600;color:var(--text3)')}>Cancel</div>
                </div>
              ) : (
                <div style={s('display:flex;gap:8px;margin-top:10px')}>
                  <div className="ctl" onClick={() => setOpenMethodFor(p.id)} style={s('flex:1;text-align:center;padding:9px;border-radius:10px;font-size:12.5px;font-weight:700;background:var(--accent);color:var(--accent-ink)')}>Mark paid</div>
                  <div className="ctl" onClick={() => waive(p.id)} style={s('padding:9px 14px;border-radius:10px;font-size:12.5px;font-weight:600;border:1px solid var(--line);color:var(--text2)')}>Waive</div>
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
