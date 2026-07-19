import { s } from '../lib/style.js';
import { Header, SectionLabel, Card, ChoiceRow } from '../components/SettingsUI.jsx';

// A tiny live preview so the choice is tangible: the same sample values rendered
// in the currently-selected system. (Global reformatting of every screen is a
// follow-up; this screen owns the preference and shows what it means.)
const SAMPLES = [
  { what: 'Ride distance', metric: '42.2 km', imperial: '26.2 mi' },
  { what: 'Pace', metric: '4:15 /km', imperial: '6:51 /mi' },
  { what: 'Body weight', metric: '72 kg', imperial: '159 lb' },
  { what: 'Elevation', metric: '860 m', imperial: '2,822 ft' },
];

function PreviewRow({ what, value, last }) {
  return (
    <div style={s(`display:flex;align-items:center;padding:12px 15px${last ? '' : ';border-bottom:1px solid var(--line)'}`)}>
      <span style={s('flex:1;font-size:13px;color:var(--text2)')}>{what}</span>
      <span className="mono" style={s('font-size:13px;font-weight:700;color:var(--text)')}>{value}</span>
    </div>
  );
}

export default function Units({ state, actions }) {
  const { units = 'metric', temp = 'c' } = state;
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <Header title="Units" onBack={() => actions.go('settings')}
        sub="Choose how distances, pace, weight and temperature are shown across Domestique." />

      <SectionLabel>Measurement</SectionLabel>
      <Card>
        <ChoiceRow
          label="Distance & weight"
          options={[{ id: 'metric', label: 'Metric · km, kg' }, { id: 'imperial', label: 'Imperial · mi, lb' }]}
          value={units}
          onChange={actions.setUnits}
          hint="Applies to ride distance, pace, speed, elevation and body weight."
          last
        />
      </Card>

      <SectionLabel>Temperature</SectionLabel>
      <Card>
        <ChoiceRow
          label="Weather & sensors"
          options={[{ id: 'c', label: 'Celsius °C' }, { id: 'f', label: 'Fahrenheit °F' }]}
          value={temp}
          onChange={actions.setTemp}
          last
        />
      </Card>

      <SectionLabel>Preview</SectionLabel>
      <Card>
        {SAMPLES.map((r, i) => (
          <PreviewRow key={r.what} what={r.what} value={units === 'imperial' ? r.imperial : r.metric} last={i === SAMPLES.length - 1} />
        ))}
      </Card>
    </div>
  );
}
