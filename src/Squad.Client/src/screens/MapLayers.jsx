import { useState } from 'react';
import { s } from '../lib/style.js';
import { Header, SectionLabel, Card, ToggleRow } from '../components/SettingsUI.jsx';
import { BASEMAP_ORDER, BASEMAP_LABEL } from '../lib/basemaps.js';
import { getMapLayerPrefs, setMapLayerPrefs, getMapView, setMapStyle } from '../lib/mapView.js';

// Pick which basemap layers appear in every map's layer switcher (favorites) and which one
// maps open on (default). Persisted locally (mapView.js); basemaps.js reads it to filter/resolve.
// Out-of-the-box, all layers are favorites and nothing is filtered until the athlete customizes.

const Chip = ({ active, onClick, children }) => (
  <div className="ctl" onClick={onClick}
    style={s('padding:9px 14px;border-radius:11px;font-size:12.5px;font-weight:600;' + (active ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'))}>{children}</div>
);

export default function MapLayers({ actions }) {
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
    if (next.has(key)) { if (next.size <= 1) return; next.delete(key); } // always keep at least one
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
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <Header title="Maps" onBack={() => actions.go('settings')}
        sub="Choose which map layers you use and which one maps open on. Layers you don't favorite are hidden from every map's layer switcher." />

      <SectionLabel>Favorite layers</SectionLabel>
      <Card>
        {BASEMAP_ORDER.map((k, i) => (
          <ToggleRow key={k} label={BASEMAP_LABEL[k]} hint={k === 'offroad' ? 'Trail detail — Israel only' : undefined}
            on={fav.has(k)} onChange={() => toggleFav(k)} last={i === BASEMAP_ORDER.length - 1} />
        ))}
      </Card>

      <SectionLabel>Default layer</SectionLabel>
      <Card style="padding:14px 15px">
        <div style={s('display:flex;gap:8px;flex-wrap:wrap')}>
          {favList.map((k) => <Chip key={k} active={def === k} onClick={() => pickDefault(k)}>{BASEMAP_LABEL[k]}</Chip>)}
        </div>
        <div style={s('font-size:11px;color:var(--text3);margin-top:11px;line-height:1.5')}>New maps open on this layer.</div>
      </Card>
    </div>
  );
}
