import { s } from '../lib/style.js';
import { Back } from './wizard.jsx';
import ActivityUpload from '../components/ActivityUpload.jsx';
import AppleHealthSync from '../components/AppleHealthSync.jsx';
import GarminSync from '../components/GarminSync.jsx';

// Screen wrapper around ActivityUpload: drops a .fit onto the real ingest endpoint
// (/api/activities/upload). Once the background worker parses it, the fan-out pushes
// it to the squad feed live; we also bump the data-refresh signal so the Activities
// list and leaderboard re-fetch. The Apple Health panel below feeds the same pipeline
// via /api/activities/native/healthkit (native iOS build only — no-ops on web).
export default function UploadActivity({ actions, getToken, onDataChanged }) {
  return (
    <div style={s('animation:floatUp .35s ease')}>
      {/* back now in the global app header */}
      <ActivityUpload
        getToken={getToken}
        onUploaded={(result) => { if (result?.status === 'queued') onDataChanged?.(); }}
      />
      <AppleHealthSync getToken={getToken} onDataChanged={onDataChanged} />
      <GarminSync getToken={getToken} onDataChanged={onDataChanged} />
    </div>
  );
}
