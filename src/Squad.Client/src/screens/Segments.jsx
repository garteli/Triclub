import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';

// Segments (climb leaderboards / QOM-KOM) aren't wired to a live source yet — show a
// clean coming-soon state instead of demo efforts. Restore the map + effort UI once
// segment detection runs off real activity tracks.
export default function Segments() {
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Segments</div>
      <div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px;margin-top:2px')}>Climbs & sprints</div>
      <EmptyState icon="⛰️" title="No segments yet" sub="Ride a climb or sprint and it becomes a segment here — with your PRs and the club leaderboard." pad="48px 24px" />
    </div>
  );
}
