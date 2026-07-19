import { s } from '../lib/style.js';

// Shared building blocks for the Settings sub-screens (Units, Notifications,
// Privacy, Help, Legal). Matches the cards/labels used in Settings.jsx so the
// detail screens feel like one continuous surface.

const labelCss = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600;margin:22px 2px 10px';
const cardCss = 'background:var(--bg2);border:1px solid var(--line);border-radius:16px';

export const Back = ({ onClick }) => (
  <div className="ctl" onClick={onClick} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
  </div>
);

// Back button + title, and an optional lead paragraph under it.
export const Header = ({ title, sub, onBack }) => (
  <>
    <div style={s('display:flex;align-items:center;gap:10px')}>
      <Back onClick={onBack} />
      <div style={s('font-size:20px;font-weight:700')}>{title}</div>
    </div>
    {sub && <div style={s('font-size:12.5px;color:var(--text2);margin-top:8px;line-height:1.5')}>{sub}</div>}
  </>
);

export const SectionLabel = ({ children }) => <div style={s(labelCss)}>{children}</div>;
export const Card = ({ children, style = '' }) => <div style={s(cardCss + (style ? ';' + style : ''))}>{children}</div>;

// iOS-style toggle. Local copy (rather than importing wizard's) to keep the kit
// self-contained.
export const Switch = ({ on, onChange }) => (
  <div className="ctl" onClick={() => onChange(!on)}
    style={s('width:44px;height:26px;border-radius:13px;flex:none;padding:3px;transition:all .15s;background:' + (on ? 'var(--accent)' : 'var(--bg4)'))}>
    <div style={s('width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .15s;transform:translateX(' + (on ? '18px' : '0') + ')')} />
  </div>
);

// A label (+ optional hint) with a switch on the right.
export const ToggleRow = ({ label, hint, on, onChange, last }) => (
  <div style={s(`display:flex;align-items:center;gap:12px;padding:13px 15px${last ? '' : ';border-bottom:1px solid var(--line)'}`)}>
    <div style={s('flex:1;min-width:0')}>
      <div style={s('font-size:13.5px;font-weight:600;color:var(--text)')}>{label}</div>
      {hint && <div style={s('font-size:11.5px;color:var(--text3);margin-top:2px;line-height:1.4')}>{hint}</div>}
    </div>
    <Switch on={on} onChange={onChange} />
  </div>
);

// Segmented single-choice control (used for units + privacy visibility).
export const Segmented = ({ options, value, onChange }) => (
  <div style={s('display:flex;gap:7px')}>
    {options.map((o) => {
      const active = value === o.id;
      return (
        <div key={o.id} className="ctl" onClick={() => onChange(o.id)}
          style={s('flex:1;text-align:center;padding:10px 6px;border-radius:11px;font-size:12.5px;font-weight:600;' + (active ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'))}>{o.label}</div>
      );
    })}
  </div>
);

// A titled block inside a card: label on top, a segmented choice below, optional hint.
export const ChoiceRow = ({ label, hint, options, value, onChange, last }) => (
  <div style={s(`padding:14px 15px${last ? '' : ';border-bottom:1px solid var(--line)'}`)}>
    <div style={s('font-size:12.5px;color:var(--text2);font-weight:600;margin-bottom:9px')}>{label}</div>
    <Segmented options={options} value={value} onChange={onChange} />
    {hint && <div style={s('font-size:11px;color:var(--text3);margin-top:9px;line-height:1.4')}>{hint}</div>}
  </div>
);

// A tappable navigation / action row with an optional right-side value + chevron.
export const LinkRow = ({ children, value, onClick, last, danger, external }) => (
  <div className="ctl" onClick={onClick} style={s(`display:flex;align-items:center;gap:10px;padding:14px 15px${last ? '' : ';border-bottom:1px solid var(--line)'}`)}>
    <span style={s('flex:1;font-size:13.5px;font-weight:600;' + (danger ? 'color:var(--bad)' : 'color:var(--text)'))}>{children}</span>
    {value && <span style={s('font-size:12.5px;color:var(--text3)')}>{value}</span>}
    {!danger && (
      external
        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
        : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
    )}
  </div>
);
