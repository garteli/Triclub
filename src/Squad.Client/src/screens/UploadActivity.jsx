import { s } from '../lib/style.js';
import { Back } from './wizard.jsx';
import ActivityUpload from '../components/ActivityUpload.jsx';

// Screen wrapper around ActivityUpload: drops a .fit onto the real ingest endpoint
// (/api/activities/upload). Once the background worker parses it, the fan-out pushes
// it to the squad feed live; we also bump the data-refresh signal so the Activities
// list and leaderboard re-fetch.
export default function UploadActivity({ actions, getToken, onDataChanged }) {
  return (
    <div style={s('animation:floatUp .35s ease')}>
      <div style={s('display:flex;align-items:center;gap:12px;padding:6px 18px 0')}>
        <Back onClick={() => actions.go('activities')} />
        <div style={s('font-size:15px;font-weight:700')}>Back to activities</div>
      </div>
      <ActivityUpload
        getToken={getToken}
        onUploaded={(result) => { if (result?.status === 'queued') onDataChanged?.(); }}
      />
    </div>
  );
}
