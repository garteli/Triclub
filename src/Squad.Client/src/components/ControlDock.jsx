import { s } from '../lib/style.js';

const dockSeg = (active) =>
  active
    ? 'flex:1;text-align:center;padding:7px 6px;border-radius:9px;font-size:11.5px;font-weight:600;background:#d6ff3f;color:#141a05'
    : 'flex:1;text-align:center;padding:7px 6px;border-radius:9px;font-size:11.5px;font-weight:600;background:rgba(255,255,255,.06);color:#c8ccd2';

const menuBase = 'padding:7px 10px;border-radius:9px;font-size:12px;font-weight:500;';

const screenMenuDef = [
  ['welcome', 'Welcome · sign-up'], ['register', 'Register athlete'], ['newgroup', 'Register a group'],
  ['dash', 'Domestique Team Dashboard'], ['ride', 'Live Group Ride'], ['plan', 'Plan / Calendar'],
  ['discover', 'Discover Groups'], ['group', 'Group Profile'], ['recordpay', 'Record payment · rider'], ['ledger', 'Ride payments · coach'], ['requests', 'Join Requests · coach'], ['chat', 'Messages'],
  ['activities', 'Activities'], ['feed', 'Activity detail'],
  ['lb', 'Leaderboard'], ['seg', 'Segments'], ['coach', 'AI Coach'], ['profile', 'Profile'],
  ['athlete', 'Athlete profile'], ['editprofile', 'Edit profile'], ['notifs', 'Notifications'], ['settings', 'Settings'],
];

const label = 'color:#5f6976;text-transform:uppercase;letter-spacing:1.4px;font-size:9.5px;margin-bottom:8px;font-weight:600';
const divider = 'height:1px;background:rgba(255,255,255,.08)';

function Swatch({ color, title, active, onClick }) {
  return (
    <div
      className="ctl"
      title={title}
      onClick={onClick}
      style={s(`width:26px;height:26px;border-radius:8px;background:${color};border:2px solid ${active ? '#fff' : 'transparent'}`)}
    />
  );
}

export default function ControlDock({ state, actions }) {
  const { theme, lang, accent, screen, dashVar, rideVar } = state;
  return (
    <div className="dock" style={s('position:sticky;top:40px;width:230px;flex:none;display:flex;flex-direction:column;gap:18px;color:#c8ccd2;font-size:12.5px')}>
      {/* brand */}
      <div style={s('display:flex;align-items:center;gap:9px')}>
        <div style={s('width:30px;height:30px;border-radius:9px;background:#d6ff3f;display:flex;align-items:center;justify-content:center;font-weight:700;color:#141a05;font-size:15px')}>S</div>
        <div>
          <div style={s('font-weight:700;color:#fff;font-size:15px;letter-spacing:-.3px')}>Domestique Team</div>
          <div style={s('color:#5f6976;font-size:10.5px;text-transform:uppercase;letter-spacing:1.5px')}>prototype</div>
        </div>
      </div>

      <div style={s(divider)} />

      {/* theme */}
      <div>
        <div style={s(label)}>Theme</div>
        <div style={s('display:flex;gap:6px')}>
          <div className="ctl" onClick={() => actions.setTheme('dark')} style={s(dockSeg(theme === 'dark'))}>Dark</div>
          <div className="ctl" onClick={() => actions.setTheme('light')} style={s(dockSeg(theme === 'light'))}>Light</div>
        </div>
      </div>

      {/* language */}
      <div>
        <div style={s(label)}>Language · RTL</div>
        <div style={s('display:flex;gap:6px')}>
          <div className="ctl" onClick={() => actions.setLang('en')} style={s(dockSeg(lang === 'en'))}>EN</div>
          <div className="ctl" onClick={() => actions.setLang('he')} style={s(dockSeg(lang === 'he'))}>עברית</div>
        </div>
        <div style={s('color:#5f6976;font-size:10px;margin-top:6px;line-height:1.4')}>Flips the Dashboard + nav to full RTL Hebrew.</div>
      </div>

      {/* accent */}
      <div>
        <div style={s(label)}>Accent</div>
        <div style={s('display:flex;gap:8px')}>
          <Swatch color="#d6ff3f" title="Volt"     active={accent === 'lime'}   onClick={() => actions.setAccent('lime')} />
          <Swatch color="#ff6a2c" title="Ember"    active={accent === 'orange'} onClick={() => actions.setAccent('orange')} />
          <Swatch color="#2fdcc8" title="Aqua"     active={accent === 'teal'}   onClick={() => actions.setAccent('teal')} />
          <Swatch color="#5a86ff" title="Electric" active={accent === 'blue'}   onClick={() => actions.setAccent('blue')} />
        </div>
      </div>

      <div style={s(divider)} />

      {/* screens */}
      <div>
        <div style={s(label)}>Screen</div>
        <div style={s('display:flex;flex-direction:column;gap:3px')}>
          {screenMenuDef.map(([id, text]) => {
            const active = screen === id;
            return (
              <div
                key={id}
                className="ctl"
                onClick={() => actions.go(id)}
                style={s(menuBase + (active ? 'background:rgba(214,255,63,.14);color:#d6ff3f' : 'background:transparent;color:#aab2bd'))}
              >
                {text}
              </div>
            );
          })}
        </div>
      </div>

      <div style={s(divider)} />

      {/* variants */}
      <div>
        <div style={s(label)}>Variants</div>
        <div style={s('color:#8b93a0;font-size:10.5px;margin-bottom:4px')}>Dashboard</div>
        <div style={s('display:flex;gap:6px;margin-bottom:10px')}>
          <div className="ctl" onClick={() => actions.setDashVar('a')} style={s(dockSeg(dashVar === 'a'))}>A · Feed</div>
          <div className="ctl" onClick={() => actions.setDashVar('b')} style={s(dockSeg(dashVar === 'b'))}>B · Domestique Team</div>
        </div>
        <div style={s('color:#8b93a0;font-size:10.5px;margin-bottom:4px')}>Live Ride</div>
        <div style={s('display:flex;gap:6px')}>
          <div className="ctl" onClick={() => actions.setRideVar('a')} style={s(dockSeg(rideVar === 'a'))}>A · Map</div>
          <div className="ctl" onClick={() => actions.setRideVar('b')} style={s(dockSeg(rideVar === 'b'))}>B · Focus</div>
        </div>
      </div>
    </div>
  );
}
