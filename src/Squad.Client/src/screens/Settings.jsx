import { s } from '../lib/style.js';
import { unitsLabel } from '../lib/prefs.js';
import Avatar from '../components/Avatar.jsx';

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600;margin:22px 2px 10px';
const card = 'background:var(--bg2);border:1px solid var(--line);border-radius:16px';
const rowLabel = 'font-size:12.5px;color:var(--text2);font-weight:600;margin-bottom:9px';

const accents = [
  { id: 'lime',   color: '#d6ff3f', name: 'Volt' },
  { id: 'orange', color: '#ff6a2c', name: 'Ember' },
  { id: 'teal',   color: '#2fdcc8', name: 'Aqua' },
  { id: 'blue',   color: '#5a86ff', name: 'Electric' },
];

const Seg = ({ active, onClick, children }) => (
  <div className="ctl" onClick={onClick} style={s('flex:1;text-align:center;padding:10px;border-radius:11px;font-size:12.5px;font-weight:600;' + (active ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'))}>{children}</div>
);

const NavRow = ({ children, danger, last, onClick }) => (
  <div className="ctl" onClick={onClick} style={s(`display:flex;align-items:center;padding:14px 15px${last ? '' : ';border-bottom:1px solid var(--line)'}`)}>
    <span style={s('flex:1;font-size:13.5px;font-weight:600;' + (danger ? 'color:var(--bad)' : 'color:var(--text)'))}>{children}</span>
    {!danger && <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>}
  </div>
);

export default function Settings({ vm, state, actions }) {
  const { theme, accent, lang, units } = state;
  const me = vm.me;
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:center;gap:10px')}>
        <div className="ctl" onClick={() => actions.go('profile')} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
        </div>
        <div style={s('font-size:20px;font-weight:700')}>Settings</div>
      </div>

      {/* account */}
      <div className="ctl" onClick={() => actions.go('editprofile')} style={s(card + ';display:flex;align-items:center;gap:13px;padding:13px 14px;margin-top:16px')}>
        <Avatar photo={me.photo} initials={me.initials} color={me.color} size={46} radius={14} fontSize={16} />
        <div style={s('flex:1')}>
          <div style={s('font-size:15px;font-weight:700')}>{me.name}</div>
          <div style={s('font-size:11.5px;color:var(--text2)')}>{me.club} · Age-group {me.ageGroup}</div>
        </div>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
      </div>

      {/* appearance */}
      <div style={s(label)}>Appearance</div>
      <div style={s(card + ';padding:14px 15px')}>
        <div style={s(rowLabel)}>Theme</div>
        <div style={s('display:flex;gap:7px')}>
          <Seg active={theme === 'dark'} onClick={() => actions.setTheme('dark')}>Dark</Seg>
          <Seg active={theme === 'light'} onClick={() => actions.setTheme('light')}>Light</Seg>
        </div>
        <div style={s('height:1px;background:var(--line);margin:15px 0')} />
        <div style={s(rowLabel)}>Accent color</div>
        <div style={s('display:flex;gap:12px;align-items:center')}>
          {accents.map((a) => (
            <div key={a.id} className="ctl" title={a.name} onClick={() => actions.setAccent(a.id)}
              style={s(`width:36px;height:36px;border-radius:11px;background:${a.color};border:2px solid ${accent === a.id ? 'var(--text)' : 'transparent'}`)} />
          ))}
        </div>
      </div>

      {/* language */}
      <div style={s(label)}>Language</div>
      <div style={s(card + ';padding:14px 15px')}>
        <div style={s('display:flex;gap:7px')}>
          <Seg active={lang === 'en'} onClick={() => actions.setLang('en')}>English</Seg>
          <Seg active={lang === 'he'} onClick={() => actions.setLang('he')}>עברית</Seg>
        </div>
        <div style={s('font-size:11px;color:var(--text3);margin-top:9px;line-height:1.4')}>Hebrew flips the whole app to right-to-left.</div>
      </div>

      {/* general */}
      <div style={s(label)}>General</div>
      <div style={s(card)}>
        <NavRow onClick={() => actions.go('units')}>Units · {unitsLabel(units)}</NavRow>
        <NavRow onClick={() => actions.go('zones')}>Training zones · FTP &amp; max HR</NavRow>
        <NavRow onClick={() => actions.go('notifprefs')}>Notifications</NavRow>
        <NavRow onClick={() => actions.go('sensors')}>Connected apps &amp; sensors</NavRow>
        <NavRow last onClick={() => actions.go('privacy')}>Privacy</NavRow>
      </div>

      {/* about */}
      <div style={s(label)}>About</div>
      <div style={s(card)}>
        <NavRow onClick={() => actions.go('help')}>Help &amp; feedback</NavRow>
        <NavRow onClick={() => actions.go('legal')}>Terms &amp; privacy policy</NavRow>
        <div style={s('display:flex;align-items:center;padding:14px 15px;border-top:1px solid var(--line)')}>
          <span style={s('flex:1;font-size:13.5px;font-weight:600;color:var(--text2)')}>Version</span>
          <span className="mono" style={s('font-size:12.5px;color:var(--text3)')}>1.0.0</span>
        </div>
      </div>

      {/* sign out */}
      <div style={s(card + ';margin-top:14px')}>
        <NavRow danger last onClick={() => actions.signOut()}>Sign out</NavRow>
      </div>
    </div>
  );
}
