import { s } from '../lib/style.js';
import { Header, SectionLabel, Card, ChoiceRow, ToggleRow, LinkRow } from '../components/SettingsUI.jsx';

const VISIBILITY = [
  { id: 'public', label: 'Everyone' },
  { id: 'squad', label: 'My team' },
  { id: 'private', label: 'Only me' },
];

export default function Privacy({ state, actions }) {
  const p = state.privacy || {};
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <Header title="Privacy" onBack={() => actions.go('settings')}
        sub="Control who sees your profile and activities, and what data is shared." />

      <SectionLabel>Visibility</SectionLabel>
      <Card>
        <ChoiceRow label="Profile" options={VISIBILITY} value={p.profile || 'squad'}
          onChange={(v) => actions.setPrivacy('profile', v)} />
        <ChoiceRow label="Activity maps" options={VISIBILITY} value={p.activityMap || 'squad'}
          onChange={(v) => actions.setPrivacy('activityMap', v)}
          hint="Who can see the route maps on your recorded activities." last />
      </Card>

      <SectionLabel>Location</SectionLabel>
      <Card>
        <ToggleRow label="Hide start & finish" hint="Blur the first and last 200 m near saved places"
          on={!!p.hideEnds} onChange={(v) => actions.setPrivacy('hideEnds', v)} />
        <ToggleRow label="Share live location" hint="Show your position to the pack during group rides"
          on={!!p.liveLocation} onChange={(v) => actions.setPrivacy('liveLocation', v)} last />
      </Card>

      <SectionLabel>Discovery</SectionLabel>
      <Card>
        <ToggleRow label="Show on leaderboards" hint="Appear in your team's weekly rankings"
          on={!!p.leaderboard} onChange={(v) => actions.setPrivacy('leaderboard', v)} />
        <ToggleRow label="Discoverable" hint="Let athletes find you in Discover and search"
          on={!!p.discoverable} onChange={(v) => actions.setPrivacy('discoverable', v)} />
        <ToggleRow label="Share usage analytics" hint="Send anonymous data to help improve the app"
          on={!!p.analytics} onChange={(v) => actions.setPrivacy('analytics', v)} last />
      </Card>

      <SectionLabel>Your data</SectionLabel>
      <Card>
        <LinkRow onClick={() => actions.exportData?.()}>Download my data</LinkRow>
        <LinkRow danger last onClick={() => actions.deleteAccount?.()}>Delete account</LinkRow>
      </Card>

      <div style={s('font-size:11px;color:var(--text3);margin-top:14px;line-height:1.5;padding:0 2px')}>
        Deleting your account permanently removes your activities, memberships and messages. This can't be undone.
      </div>
    </div>
  );
}
