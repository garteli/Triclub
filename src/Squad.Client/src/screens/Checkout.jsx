import { s } from '../lib/style.js';

export default function Checkout({ vm, actions }) {
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* title + back now in the global app header (Back clears the pending pay plan) */}
      {/* order summary */}
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:15px 16px;margin-top:16px;display:flex;align-items:center;justify-content:space-between')}>
        <div><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600')}>{vm.selGroupData.name}</div><div style={s('font-size:16px;font-weight:700;margin-top:2px')}>{vm.payTitle}</div></div>
        <div className="mono" style={s('font-size:22px;font-weight:700;color:var(--accent)')}>{vm.payPrice}</div>
      </div>

      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600;margin:20px 0 10px')}>Payment</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px;display:flex;align-items:center;gap:11px')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20" /></svg>
        <span className="mono" style={s('font-size:13px;color:var(--text2);letter-spacing:1px')}>•••• •••• •••• 4242</span>
      </div>
      <div style={s('display:flex;gap:9px;margin-top:9px')}>
        <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px')}><span className="mono" style={s('font-size:13px;color:var(--text2)')}>09 / 27</span></div>
        <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px')}><span className="mono" style={s('font-size:13px;color:var(--text2)')}>CVC •••</span></div>
      </div>
      <div style={s('font-size:11px;color:var(--text3);line-height:1.5;margin-top:14px')}>Payments go to the group owner. Membership renews monthly; cancel anytime. One-time rides are single-charge.</div>
      <div className="ctl" onClick={actions.confirmPay} style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:15px;border-radius:14px;font-weight:700;font-size:15px;margin-top:16px')}>Pay {vm.payPrice}</div>
    </div>
  );
}
