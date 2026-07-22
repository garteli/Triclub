import { s } from '../lib/style.js';
import SquadEvents from '../components/SquadEvents.jsx';
import EmptyState from '../components/EmptyState.jsx';

// The motorsport clubs' second tab. Motorsport clubs run on scheduled group rides
// rather than a structured training plan, so this replaces Plan in the bottom nav
// (see navFor in data/squadData.js) and shows the active club's upcoming sessions —
// join, and check in on the day, the same as the group-page session list.
export default function Events({ vm, getToken }) {
  const squadId = vm.activeClubId;
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <div style={s('margin-bottom:2px')}>
        <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Upcoming</div>
        <div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px')}>Events</div>
        {vm.squadName && <div style={s('font-size:12.5px;color:var(--text2);margin-top:2px')}>{vm.squadName}</div>}
      </div>

      {squadId
        ? <SquadEvents squadId={squadId} getToken={getToken} mode="browse" standalone disc={vm.activeSquad?.disc} />
        : <EmptyState icon="🏁" title="No club yet" sub="Join a club to see its scheduled rides and sessions here." />}
    </div>
  );
}
