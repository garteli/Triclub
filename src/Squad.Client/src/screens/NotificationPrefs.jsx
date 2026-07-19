import { s } from '../lib/style.js';
import { Header, SectionLabel, Card, ToggleRow } from '../components/SettingsUI.jsx';

// Notification preference groups. `key` maps to state.notif[key].
const GROUPS = [
  {
    title: 'Social',
    rows: [
      { key: 'kudos', label: 'Kudos', hint: 'When someone kudos an activity you shared' },
      { key: 'comments', label: 'Comments', hint: 'Replies on your activities and posts' },
      { key: 'follows', label: 'New followers', hint: 'When an athlete follows you' },
    ],
  },
  {
    title: 'Training & team',
    rows: [
      { key: 'groupInvites', label: 'Team & group invites', hint: 'Invites and join-request approvals' },
      { key: 'rideStart', label: 'Group ride starting', hint: 'When a ride you joined goes live' },
      { key: 'coachMessages', label: 'Coach messages', hint: 'Direct messages from your coach' },
      { key: 'leaderboard', label: 'Leaderboard placement', hint: 'Your weekly rank in the team' },
    ],
  },
  {
    title: 'Digests',
    rows: [
      { key: 'weeklySummary', label: 'Weekly summary', hint: 'Your Monday training recap' },
      { key: 'productNews', label: 'Product news & tips', hint: 'Occasional updates about new features' },
    ],
  },
];

export default function NotificationPrefs({ state, actions }) {
  const notif = state.notif || {};
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <Header title="Notifications" onBack={() => actions.go('settings')}
        sub="Pick what Domestique pushes to this device. You can always change these later." />

      {GROUPS.map((g) => (
        <div key={g.title}>
          <SectionLabel>{g.title}</SectionLabel>
          <Card>
            {g.rows.map((r, i) => (
              <ToggleRow key={r.key} label={r.label} hint={r.hint}
                on={!!notif[r.key]} onChange={(v) => actions.setNotif(r.key, v)}
                last={i === g.rows.length - 1} />
            ))}
          </Card>
        </div>
      ))}

      <SectionLabel>Delivery</SectionLabel>
      <Card>
        <ToggleRow label="Quiet hours" hint="Mute notifications 22:00 – 07:00"
          on={!!notif.quietHours} onChange={(v) => actions.setNotif('quietHours', v)} last />
      </Card>

      <div style={s('font-size:11px;color:var(--text3);margin-top:14px;line-height:1.5;padding:0 2px')}>
        System-level permission is still required — if you disabled notifications for Domestique in
        your device settings, none of these will be delivered.
      </div>
    </div>
  );
}
