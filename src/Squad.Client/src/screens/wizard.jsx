import { s } from '../lib/style.js';

// Shared building blocks for the registration wizards (Register + CreateGroup).

export const Back = ({ onClick }) => (
  <div className="ctl" onClick={onClick} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
  </div>
);

// Header row: back button + progress dots for a `total`-step flow.
export function StepHeader({ step, total, onBack }) {
  return (
    <div style={s('display:flex;align-items:center;gap:12px')}>
      <Back onClick={onBack} />
      <div style={s('flex:1;display:flex;gap:6px')}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={s('flex:1;height:4px;border-radius:2px;background:' + (i <= step ? 'var(--accent)' : 'var(--bg4)'))} />
        ))}
      </div>
    </div>
  );
}

export const Title = ({ children }) => <div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px;margin-top:20px')}>{children}</div>;
export const Sub = ({ children }) => <div style={s('font-size:13px;color:var(--text2);line-height:1.5;margin-top:4px')}>{children}</div>;
export const FieldLabel = ({ children }) => <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:16px 2px 7px')}>{children}</div>;

// box-sizing + min-width:0 + appearance:none keep native controls (esp. iOS date inputs)
// from overflowing their box and overlapping a neighbour in a side-by-side row.
const inputStyle = 'width:100%;box-sizing:border-box;min-width:0;-webkit-appearance:none;appearance:none;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--text);outline:none;font-family:inherit';

export function Field({ label, value, onChange, placeholder, type = 'text', mono }) {
  return (
    <>
      {label && <FieldLabel>{label}</FieldLabel>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={mono ? 'mono' : undefined}
        style={s(inputStyle)}
      />
    </>
  );
}

export function TextArea({ label, value, onChange, placeholder }) {
  return (
    <>
      {label && <FieldLabel>{label}</FieldLabel>}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3}
        style={s(inputStyle + ';resize:none;line-height:1.5')} />
    </>
  );
}

// Toggleable pills. `multi` allows several selected (value is an array).
export function Chips({ options, value, onChange, multi }) {
  const isOn = (o) => (multi ? value.includes(o) : value === o);
  const toggle = (o) => {
    if (!multi) return onChange(o);
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  };
  return (
    <div style={s('display:flex;gap:8px;flex-wrap:wrap')}>
      {options.map((o) => (
        <div key={o} className="ctl" onClick={() => toggle(o)}
          style={s('padding:9px 14px;border-radius:11px;font-size:12.5px;font-weight:600;' + (isOn(o) ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg2);border:1px solid var(--line);color:var(--text2)'))}>{o}</div>
      ))}
    </div>
  );
}

export function Switch({ on, onChange }) {
  return (
    <div className="ctl" onClick={() => onChange(!on)}
      style={s('width:44px;height:26px;border-radius:13px;flex:none;padding:3px;transition:all .15s;background:' + (on ? 'var(--accent)' : 'var(--bg4)'))}>
      <div style={s('width:20px;height:20px;border-radius:50%;background:#fff;transition:all .15s;transform:translateX(' + (on ? '18px' : '0') + ')')} />
    </div>
  );
}

export const PrimaryBtn = ({ onClick, children, disabled }) => (
  <div className={disabled ? undefined : 'ctl'} onClick={disabled ? undefined : onClick}
    style={s('text-align:center;padding:15px;border-radius:14px;font-weight:700;font-size:15px;margin-top:22px;' + (disabled ? 'background:var(--bg4);color:var(--text3)' : 'background:var(--accent);color:var(--accent-ink)'))}>{children}</div>
);

export const TextBtn = ({ onClick, children }) => (
  <div className="ctl" onClick={onClick} style={s('text-align:center;font-size:12.5px;font-weight:600;color:var(--text3);margin-top:12px')}>{children}</div>
);
