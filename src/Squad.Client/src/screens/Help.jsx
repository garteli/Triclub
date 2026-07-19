import { useState } from 'react';
import { s } from '../lib/style.js';
import { Header, SectionLabel, Card, LinkRow } from '../components/SettingsUI.jsx';

const FAQ = [
  {
    q: 'How do I record a ride?',
    a: 'Open the Ride tab and tap Start. On the web app recording runs while the screen is on; for background GPS and Bluetooth sensors, use the Domestique Team app on iOS or Android.',
  },
  {
    q: 'Why don’t my sensors show up?',
    a: 'Sensor pairing needs Web Bluetooth (Chrome on Android/desktop) or the native app — Safari and iOS Safari don’t support it. Make sure the sensor is awake, nearby, and not connected to another app.',
  },
  {
    q: 'How is the leaderboard scored?',
    a: 'Each activity is de-duplicated across your connected sources and ranked by training load for the week. Your team’s coach can adjust the scoring window.',
  },
  {
    q: 'Can I import activities from Garmin or Strava?',
    a: 'Yes — upload a .FIT file from the Activities tab, or connect a source under Settings → Connected apps & sensors. Duplicate activities are merged automatically.',
  },
];

function Faq({ item, open, onToggle }) {
  return (
    <div style={s('border-bottom:1px solid var(--line)')}>
      <div className="ctl" onClick={onToggle} style={s('display:flex;align-items:center;gap:10px;padding:14px 15px')}>
        <span style={s('flex:1;font-size:13.5px;font-weight:600;color:var(--text)')}>{item.q}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"
          style={s('transition:transform .18s;transform:rotate(' + (open ? '90deg' : '0') + ')')}><path d="M9 6l6 6-6 6" /></svg>
      </div>
      {open && <div style={s('padding:0 15px 14px;font-size:12.5px;color:var(--text2);line-height:1.55')}>{item.a}</div>}
    </div>
  );
}

export default function Help({ actions }) {
  const [open, setOpen] = useState(-1);
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <Header title="Help & feedback" onBack={() => actions.go('settings')}
        sub="Find answers, or get in touch — we read every message." />

      <SectionLabel>Frequently asked</SectionLabel>
      <Card>
        {FAQ.map((item, i) => (
          <Faq key={i} item={item} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
        ))}
        <div style={s('padding:2px')} />
      </Card>

      <SectionLabel>Get in touch</SectionLabel>
      <Card>
        <LinkRow external onClick={() => actions.openLink?.('mailto:support@domestique.team')}>Email support</LinkRow>
        <LinkRow external onClick={() => actions.openLink?.('https://domestique.team/help')}>Help centre</LinkRow>
        <LinkRow external last onClick={() => actions.openLink?.('https://domestique.team/feedback')}>Send feedback</LinkRow>
      </Card>

      <SectionLabel>Diagnostics</SectionLabel>
      <Card>
        <LinkRow value="1.0.0 (build 100)" last onClick={() => actions.copyDiagnostics?.()}>App version</LinkRow>
      </Card>

      <div style={s('font-size:11px;color:var(--text3);margin-top:14px;line-height:1.5;padding:0 2px')}>
        Include your app version when reporting a bug — it helps us track down the issue faster.
      </div>
    </div>
  );
}
