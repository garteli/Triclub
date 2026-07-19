import { useState } from 'react';
import { s } from '../lib/style.js';
import { Header, Segmented } from '../components/SettingsUI.jsx';

// Plain-language placeholder policies. Replace with the reviewed legal copy before
// launch; structure and effective date are wired so that's a copy swap.
const EFFECTIVE = 'Effective 1 January 2026';

const TERMS = [
  ['1. Using Domestique', 'Domestique is a training app for triathlon and cycling teams. You must be at least 16 to create an account, and you’re responsible for the activity recorded under it. Don’t misuse the service or attempt to disrupt it for others.'],
  ['2. Your content', 'You keep ownership of the activities, photos and messages you upload. You grant your team and the people you share with permission to view that content within the app. You can delete your content or account at any time.'],
  ['3. Health & safety', 'Domestique is not a medical device. Training metrics, routes and pack positions are provided for information only — always ride to the conditions and follow local traffic law. Never rely on the app for navigation or collision avoidance.'],
  ['4. Availability', 'We work to keep the service running but don’t guarantee it will be uninterrupted or error-free. Features may change, and we may suspend accounts that violate these terms.'],
  ['5. Changes', 'We’ll let you know when these terms change materially. Continuing to use Domestique after an update means you accept the revised terms.'],
];

const PRIVACY = [
  ['What we collect', 'Account details you provide (name, email, team), the activities and sensor data you record, and basic device and usage information needed to run the app.'],
  ['How we use it', 'To show your activities, power leaderboards and live rides, sync across your devices, and improve the product. We don’t sell your personal data.'],
  ['Location data', 'Route and live-position data is only shared according to your Privacy settings. You can hide start/finish points and turn off live location sharing at any time.'],
  ['Sharing', 'Your content is visible to the audiences you choose (everyone, your team, or only you). Coaches on your team can see activities you share with the team.'],
  ['Your controls', 'You can export your data, adjust visibility, and delete your account from Settings → Privacy. Deletion permanently removes your data from the service.'],
];

function Article({ sections }) {
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:4px 16px;margin-top:14px')}>
      {sections.map(([h, body], i) => (
        <div key={i} style={s(i === sections.length - 1 ? 'padding:14px 0' : 'padding:14px 0;border-bottom:1px solid var(--line)')}>
          <div style={s('font-size:13.5px;font-weight:700;color:var(--text);margin-bottom:6px')}>{h}</div>
          <div style={s('font-size:12.5px;color:var(--text2);line-height:1.6')}>{body}</div>
        </div>
      ))}
    </div>
  );
}

export default function Legal({ actions }) {
  const [tab, setTab] = useState('terms');
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <Header title="Terms & privacy" onBack={() => actions.go('settings')} />

      <div style={s('margin-top:14px')}>
        <Segmented
          options={[{ id: 'terms', label: 'Terms of Service' }, { id: 'privacy', label: 'Privacy Policy' }]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div style={s('font-size:11px;color:var(--text3);margin-top:12px;padding:0 2px')}>{EFFECTIVE}</div>

      <Article sections={tab === 'terms' ? TERMS : PRIVACY} />

      <div style={s('font-size:11px;color:var(--text3);margin-top:14px;line-height:1.5;padding:0 2px')}>
        Questions about these policies? Email <span style={s('color:var(--text2)')}>privacy@domestique.team</span>.
      </div>
    </div>
  );
}
