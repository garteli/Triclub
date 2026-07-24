import { useState } from 'react';
import { s } from '../lib/style.js';
import { unitsLabel } from '../lib/prefs.js';
import { BASEMAP_ORDER, BASEMAP_LABEL } from '../lib/basemaps.js';
import { getMapLayerPrefs, setMapLayerPrefs, getMapView, setMapStyle } from '../lib/mapView.js';

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

const Toggle = ({ on, onClick }) => (
  <div className="ctl" onClick={onClick} style={s(`width:44px;height:26px;border-radius:14px;flex:none;position:relative;transition:background .15s;${on ? 'background:var(--accent)' : 'background:var(--bg4)'}`)}>
    <div style={s(`position:absolute;top:3px;${on ? 'right:3px' : 'left:3px'};width:20px;height:20px;border-radius:50%;background:#fff;transition:all .15s`)} />
  </div>
);

const Stepper = ({ label, value, unit, min, max, onChange }) => (
  <div style={s('display:flex;align-items:center')}>
    <span style={s('flex:1;font-size:13px;color:var(--text2);font-weight:600')}>{label}</span>
    <div style={s('display:flex;align-items:center;gap:10px')}>
      <div className="ctl" onClick={() => onChange(Math.max(min, value - 1))} style={s('width:30px;height:30px;border-radius:9px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:var(--text)')}>−</div>
      <span className="mono" style={s('font-size:13.5px;font-weight:700;min-width:58px;text-align:center')}>{value} {unit}</span>
      <div className="ctl" onClick={() => onChange(Math.min(max, value + 1))} style={s('width:30px;height:30px;border-radius:9px;background:var(--bg3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:var(--text)')}>+</div>
    </div>
  </div>
);

const Chip = ({ active, onClick, children }) => (
  <div className="ctl" onClick={onClick} style={s('padding:8px 12px;border-radius:10px;font-size:12px;font-weight:600;' + (active ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'))}>{children}</div>
);

// Favorite basemap layers (which appear in every map's layer switcher) + the default layer
// maps open on. Persisted in localStorage (mapView.js); basemaps.js reads it to filter/resolve.
function MapLayersSection() {
  const seed = () => {
    const p = getMapLayerPrefs();
    const fav = new Set(p.favorites ? p.favorites.filter((k) => BASEMAP_ORDER.includes(k)) : BASEMAP_ORDER);
    if (fav.size === 0) BASEMAP_ORDER.forEach((k) => fav.add(k));
    let def = p.defaultStyle;
    if (!fav.has(def)) def = BASEMAP_ORDER.find((k) => fav.has(k)) || 'voyager';
    return { fav, def };
  };
  const [{ fav, def }, set] = useState(seed);

  const commit = (nextFav, nextDef) => {
    setMapLayerPrefs({ favorites: BASEMAP_ORDER.filter((k) => nextFav.has(k)), defaultStyle: nextDef });
    // Keep the shared "current layer" valid: if it's no longer a favorite, snap it to the default.
    if (!nextFav.has(getMapView().style)) setMapStyle(nextDef);
    set({ fav: nextFav, def: nextDef });
  };

  const toggleFav = (key) => {
    const next = new Set(fav);
    if (next.has(key)) { if (next.size <= 1) return; next.delete(key); } // keep at least one
    else next.add(key);
    const nextDef = next.has(def) ? def : BASEMAP_ORDER.find((k) => next.has(k));
    commit(next, nextDef);
  };

  const pickDefault = (key) => {
    if (!fav.has(key)) return;
    setMapLayerPrefs({ favorites: BASEMAP_ORDER.filter((k) => fav.has(k)), defaultStyle: key });
    setMapStyle(key); // apply now so the next map opens on it
    set({ fav, def: key });
  };

  const favList = BASEMAP_ORDER.filter((k) => fav.has(k));
  return (
    <>
      <div style={s(label)}>Maps</div>
      <div style={s(card + ';padding:14px 15px')}>
        <div style={s(rowLabel)}>Favorite layers</div>
        {BASEMAP_ORDER.map((k, i) => (
          <div key={k} style={s(`display:flex;align-items:center;${i ? 'margin-top:12px' : ''}`)}>
            <div style={s('flex:1;min-width:0')}>
              <span style={s('font-size:13.5px;font-weight:600;color:var(--text)')}>{BASEMAP_LABEL[k]}</span>
              {k === 'offroad' && <span style={s('font-size:10.5px;color:var(--text3);margin-left:7px')}>Israel only</span>}
            </div>
            <Toggle on={fav.has(k)} onClick={() => toggleFav(k)} />
          </div>
        ))}
        <div style={s('height:1px;background:var(--line);margin:15px 0')} />
        <div style={s(rowLabel)}>Default layer</div>
        <div style={s('display:flex;gap:7px;flex-wrap:wrap')}>
          {favList.map((k) => <Chip key={k} active={def === k} onClick={() => pickDefault(k)}>{BASEMAP_LABEL[k]}</Chip>)}
        </div>
      </div>
      <div style={s('font-size:11px;color:var(--text3);margin:8px 2px 0;line-height:1.5;padding:0 2px')}>
        Only favorite layers appear in the map layer switcher. New maps open on your default layer.
      </div>
    </>
  );
}

export default function Settings({ vm, state, actions, fallInfo }) {
  const { theme, accent, units } = state;
  const ap = state.autoPause || { enabled: true, pauseKph: 2, resumeKph: 4 };
  const motor = vm?.family === 'motorsport';
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* title + back now in the global app header */}
      {/* appearance */}
      <div style={s(label + ';margin-top:16px')}>Appearance</div>
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

      {/* recording */}
      <div style={s(label)}>Recording</div>
      <div style={s(card + ';padding:14px 15px')}>
        <div style={s('display:flex;align-items:center')}>
          <div style={s('flex:1;min-width:0')}>
            <div style={s('font-size:13.5px;font-weight:600;color:var(--text)')}>Auto-pause</div>
            <div style={s('font-size:11px;color:var(--text3);margin-top:2px;line-height:1.4')}>Pause when you stop; resume after moving for 5s.</div>
          </div>
          <Toggle on={ap.enabled} onClick={() => actions.setAutoPause('enabled', !ap.enabled)} />
        </div>
        {ap.enabled && (
          <>
            <div style={s('height:1px;background:var(--line);margin:14px 0')} />
            <Stepper label="Pause below" value={ap.pauseKph} unit="km/h" min={1} max={10} onChange={(v) => actions.setAutoPause('pauseKph', v)} />
            <div style={s('height:12px')} />
            <Stepper label="Resume above" value={ap.resumeKph} unit="km/h" min={2} max={20} onChange={(v) => actions.setAutoPause('resumeKph', v)} />
          </>
        )}
      </div>

      {/* maps — favorite basemap layers + the default every map opens on */}
      <MapLayersSection />

      {/* safety — fall / incident detection (configured here, runs automatically during a live ride) */}
      {fallInfo && (
        <>
          <div style={s(label)}>Safety</div>
          <div style={s(card + ';padding:14px 15px')}>
            <div style={s('display:flex;align-items:center')}>
              <div style={s('flex:1;min-width:0')}>
                <div style={s('font-size:13.5px;font-weight:600;color:var(--text)')}>{motor ? 'Incident detection' : 'Fall detection'}</div>
                <div style={s('font-size:11px;color:var(--text3);margin-top:2px;line-height:1.4')}>
                  {motor
                    ? 'Alert your squad and call automatically on a hard crash or roll-over during a session.'
                    : 'Alert your squad automatically if you crash during a live ride.'}
                </div>
              </div>
              {fallInfo.supported === false
                ? <span style={s('font-size:10.5px;color:var(--text3);flex:none')}>Unavailable</span>
                : <Toggle on={fallInfo.enabled} onClick={() => fallInfo.setEnabled(!fallInfo.enabled)} />}
            </div>
            {fallInfo.enabled && fallInfo.supported !== false && (
              <>
                <div style={s('height:1px;background:var(--line);margin:14px 0')} />
                <div style={s(rowLabel)}>Impact sensitivity</div>
                <div style={s('display:flex;gap:7px')}>
                  <Seg active={fallInfo.sensitivity === 'low'} onClick={() => fallInfo.setSensitivity('low')}>Low</Seg>
                  <Seg active={fallInfo.sensitivity === 'medium'} onClick={() => fallInfo.setSensitivity('medium')}>Medium</Seg>
                  <Seg active={fallInfo.sensitivity === 'high'} onClick={() => fallInfo.setSensitivity('high')}>High</Seg>
                </div>
                {!fallInfo.hasContact && (
                  <div className="ctl" onClick={() => actions.go('editprofile')} style={s('margin-top:12px;display:flex;align-items:center;gap:8px;padding:10px 11px;border-radius:11px;background:color-mix(in srgb,var(--warn) 12%,var(--bg3));border:1px solid color-mix(in srgb,var(--warn) 30%,transparent)')}>
                    <span style={s('font-size:11.5px;color:var(--text2);line-height:1.4;flex:1')}>Add an emergency contact in your profile so we can call them.</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
                  </div>
                )}
                {fallInfo.permission === 'denied' && (
                  <div style={s('margin-top:10px;font-size:11px;color:var(--bad);line-height:1.4')}>Motion access was blocked. Enable it for the app in your device settings, then turn this off and on again.</div>
                )}
                <div style={s('margin-top:10px;font-size:10.5px;color:var(--text3);line-height:1.4')}>Best-effort — works while the app is open and can miss or misfire. Never rely on it alone in an emergency.</div>
              </>
            )}
          </div>
        </>
      )}

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

      {/* administration — sysadmin accounts only */}
      {state.session?.isAdmin && (
        <>
          <div style={s(label)}>Administration</div>
          <div style={s(card)}>
            <NavRow last onClick={() => actions.go('admin')}>System admin · users &amp; groups</NavRow>
          </div>
        </>
      )}

      {/* sign out */}
      <div style={s(card + ';margin-top:14px')}>
        <NavRow danger last onClick={() => actions.signOut()}>Sign out</NavRow>
      </div>
    </div>
  );
}
