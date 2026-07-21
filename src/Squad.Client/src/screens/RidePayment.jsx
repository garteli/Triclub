import { useMemo, useState } from 'react';
import { s } from '../lib/style.js';
import { formatMinor } from '../lib/payments.js';

const Back = ({ onClick }) => (
  <div className="ctl" onClick={onClick} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
  </div>
);

const KINDS = [
  { key: 'member', label: 'Membership', sub: 'Monthly' },
  { key: 'dropin', label: 'Drop-in ride', sub: 'Single session' },
  { key: 'coach', label: '1:1 Coaching', sub: 'Personal' },
];

// method === null → log as owed (not yet settled).
const METHODS = [
  { key: 'etransfer', label: 'E-transfer' },
  { key: 'cash', label: 'Cash' },
  { key: 'link', label: 'Payment link' },
  { key: 'other', label: 'Other' },
  { key: null, label: 'Not yet — owe it' },
];

// Pull the leading number out of a display price like "₪90" / "C$45.50" → major units.
function parsePrice(price) {
  if (!price) return '';
  const m = String(price).replace(',', '.').match(/\d+(\.\d+)?/);
  return m ? m[0] : '';
}

export default function RidePayment({ vm, actions, payments }) {
  const g = vm.selGroupData || {};
  const [kind, setKind] = useState('dropin');
  const [amount, setAmount] = useState(() => parsePrice(g.price));
  const [method, setMethod] = useState('etransfer');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null); // the created payment, once recorded

  const currency = 'ILS';
  const amountMinor = Math.round((parseFloat(amount) || 0) * 100);
  const preview = useMemo(() => formatMinor(amountMinor, currency), [amountMinor]);

  const submit = async () => {
    if (amountMinor <= 0) { setError('Enter an amount.'); return; }
    setError(''); setBusy(true);
    try {
      const created = await payments.onRecordPayment({
        squadId: g.id, kind, amountMinor, currency, note: note.trim() || null,
      });
      // If the rider says they've already paid, settle it in the same flow.
      if (method && created?.id) await payments.onMarkPaid(created.id, method, null);
      setDone(created);
    } catch (e) {
      setError(e.message || 'Could not record the payment.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
        {/* title + back now in the global app header */}
        <div style={s('background:color-mix(in srgb,var(--good) 14%,var(--bg2));border:1px solid color-mix(in srgb,var(--good) 35%,transparent);border-radius:16px;padding:18px;margin-top:8px;text-align:center')}>
          <div style={s('font-size:34px')}>✅</div>
          <div style={s('font-size:15px;font-weight:700;margin-top:8px')}>{method ? 'Payment logged as paid' : 'Payment logged as owed'}</div>
          <div style={s('font-size:12.5px;color:var(--text2);margin-top:6px;line-height:1.5')}>{preview} to {g.name}. {method ? 'The coach can see it in their ledger.' : 'Settle it out-of-band, then mark it paid.'}</div>
        </div>
        <div className="ctl" onClick={() => actions.go('group')} style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:15px;border-radius:14px;font-weight:700;font-size:15px;margin-top:16px')}>Done</div>
      </div>
    );
  }

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* title + back now in the global app header */}
      <div style={s('font-size:12px;color:var(--text3);line-height:1.5;margin-top:2px')}>The app tracks who paid the coach — it doesn't move money. Pay {g.name}'s coach directly, then log it here.</div>

      {/* what for */}
      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600;margin:18px 0 9px')}>What for</div>
      <div style={s('display:flex;flex-direction:column;gap:9px')}>
        {KINDS.map((k) => (
          <div key={k.key} className="ctl" onClick={() => setKind(k.key)}
            style={s(`background:var(--bg2);border:1px solid ${kind === k.key ? 'var(--accent)' : 'var(--line)'};border-radius:14px;padding:13px 14px;display:flex;align-items:center;gap:12px`)}>
            <div style={s(`width:18px;height:18px;border-radius:50%;border:2px solid ${kind === k.key ? 'var(--accent)' : 'var(--line)'};display:flex;align-items:center;justify-content:center`)}>{kind === k.key && <div style={s('width:8px;height:8px;border-radius:50%;background:var(--accent)')} />}</div>
            <div style={s('flex:1')}><div style={s('font-size:14px;font-weight:700')}>{k.label}</div><div style={s('font-size:11.5px;color:var(--text2)')}>{k.sub}</div></div>
          </div>
        ))}
      </div>

      {/* amount */}
      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600;margin:20px 0 9px')}>Amount (₪)</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:4px 14px;display:flex;align-items:center;gap:8px')}>
        <span className="mono" style={s('font-size:20px;font-weight:700;color:var(--accent)')}>₪</span>
        <input type="number" inputMode="decimal" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
          style={s('flex:1;background:transparent;border:none;outline:none;color:var(--text);font-size:20px;font-weight:700;font-family:inherit;padding:11px 0')} />
      </div>

      {/* how paid */}
      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600;margin:20px 0 9px')}>How you paid</div>
      <div style={s('display:flex;flex-wrap:wrap;gap:8px')}>
        {METHODS.map((m) => (
          <div key={String(m.key)} className="ctl" onClick={() => setMethod(m.key)}
            style={s(`padding:9px 13px;border-radius:11px;font-size:12.5px;font-weight:600;border:1px solid ${method === m.key ? 'var(--accent)' : 'var(--line)'};background:${method === m.key ? 'var(--accent-dim)' : 'var(--bg2)'};color:${method === m.key ? 'var(--accent)' : 'var(--text2)'}`)}>{m.label}</div>
        ))}
      </div>

      {/* note */}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
        style={s('width:100%;box-sizing:border-box;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px;margin-top:16px;color:var(--text);font-size:13px;font-family:inherit;outline:none')} />

      {error && <div style={s('color:var(--bad);font-size:12px;text-align:center;margin-top:12px')}>{error}</div>}

      <div className="ctl" onClick={busy ? undefined : submit}
        style={s(`background:var(--accent);color:var(--accent-ink);text-align:center;padding:15px;border-radius:14px;font-weight:700;font-size:15px;margin-top:16px;${busy ? 'opacity:.6' : ''}`)}>
        {busy ? 'Saving…' : method ? `Log ${preview} paid` : `Log ${preview} owed`}
      </div>
    </div>
  );
}
