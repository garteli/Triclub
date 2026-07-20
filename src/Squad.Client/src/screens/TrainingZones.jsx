import { useState } from 'react';
import { s } from '../lib/style.js';
import { Header, SectionLabel, Card } from '../components/SettingsUI.jsx';
import { loadZones, saveZones } from '../lib/zones.js';

// FTP (functional threshold power) and max heart rate. Stored on-device (lib/zones.js) and
// used by the activity detail view to compute power/HR zones and Intensity Factor. Normalized
// Power and the power curve don't need these — they come from the power stream alone.

function NumberRow({ label, unit, hint, value, placeholder, onChange, last }) {
  return (
    <div style={s(`padding:13px 15px${last ? '' : ';border-bottom:1px solid var(--line)'}`)}>
      <div style={s('display:flex;align-items:center;gap:12px')}>
        <div style={s('flex:1')}>
          <div style={s('font-size:13.5px;font-weight:600')}>{label}</div>
          {hint && <div style={s('font-size:11px;color:var(--text3);margin-top:3px;line-height:1.4')}>{hint}</div>}
        </div>
        <div style={s('display:flex;align-items:center;gap:6px;flex:none')}>
          <input
            type="number" inputMode="numeric" min="1" placeholder={placeholder}
            value={value ?? ''} onChange={(e) => onChange(e.target.value)}
            style={s('width:78px;box-sizing:border-box;text-align:right;font-size:15px;font-weight:700;padding:9px 10px;border-radius:10px;border:1px solid var(--line2);background:var(--bg);color:var(--text);outline:none')}
          />
          <span className="mono" style={s('font-size:11px;color:var(--text3);width:26px')}>{unit}</span>
        </div>
      </div>
    </div>
  );
}

export default function TrainingZones({ actions }) {
  const [z, setZ] = useState(() => loadZones());

  const set = (key, raw) => {
    const n = raw === '' ? null : Number(raw);
    const next = { ...z, [key]: Number.isFinite(n) && n > 0 ? n : null };
    setZ(next);
    saveZones(next);
  };

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <Header title="Training zones" onBack={() => actions.go('settings')}
        sub="Set your thresholds so activity power and heart rate break down into zones." />

      <SectionLabel>Thresholds</SectionLabel>
      <Card>
        <NumberRow
          label="FTP" unit="W" placeholder="—"
          hint="Functional threshold power — for power zones & Intensity Factor."
          value={z.ftp} onChange={(v) => set('ftp', v)}
        />
        <NumberRow
          label="Max heart rate" unit="bpm" placeholder="—"
          hint="Your highest HR — for heart-rate zones."
          value={z.maxHr} onChange={(v) => set('maxHr', v)} last
        />
      </Card>

      <div style={s('font-size:11.5px;color:var(--text3);line-height:1.5;margin:14px 4px 0')}>
        Stored on this device only. Normalized Power and the power curve show without these; FTP
        unlocks power zones + IF, and max HR unlocks heart-rate zones.
      </div>
    </div>
  );
}
