import { useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { downscaleToJpeg, captureNativePhoto, isNativePlatform, isCancelError } from '../lib/photos.js';

const radarLabel = (r) => (!r ? '—' : r.level > 0 ? `${r.closestM ?? '?'}m` : 'clear');

// Thumbnails of photos captured this ride (local data URLs), each removable.
function PhotoStrip({ photos, onRemove }) {
  if (!photos?.length) return null;
  return (
    <div style={s('display:flex;gap:8px;flex-wrap:wrap;margin-top:12px')}>
      {photos.map((p) => (
        <div key={p.id} style={{ ...s('position:relative;width:58px;height:58px;border-radius:10px;border:1px solid var(--line);flex:none'), backgroundImage: `url("${p.dataUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
          <div className="ctl" onClick={() => onRemove(p.id)} style={s('position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;background:var(--bad);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid var(--bg);line-height:1')}>×</div>
        </div>
      ))}
    </div>
  );
}

function AddPhotoButton({ onClick, busy }) {
  return (
    <div className="ctl" onClick={busy ? undefined : onClick} style={s(`display:flex;align-items:center;justify-content:center;gap:7px;margin-top:12px;padding:11px;border-radius:12px;background:var(--bg3);border:1px solid var(--line);font-size:13px;font-weight:600;color:var(--text);opacity:${busy ? 0.6 : 1}`)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
      {busy ? 'Adding…' : 'Add photo'}
    </div>
  );
}

function SensorChip({ label, kind, status, value, connect, disconnect }) {
  const on = status === 'connected';
  const dot = on ? 'var(--good)' : status === 'connecting' ? 'var(--warn)' : status === 'error' ? 'var(--bad)' : 'var(--text3)';
  return (
    <div className="ctl" onClick={() => (on ? disconnect(kind) : connect(kind))} style={s('flex:1;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:8px 9px;text-align:center')}>
      <div style={s('display:flex;align-items:center;justify-content:center;gap:5px')}>
        <span style={s(`width:7px;height:7px;border-radius:50%;background:${dot}`)} />
        <span style={s('font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text2)')}>{label}</span>
      </div>
      <div className="mono" style={s('font-size:15px;font-weight:700;margin-top:3px')}>{value}</div>
    </div>
  );
}

const Dot = ({ color, pulse }) => (
  <span style={s(`width:9px;height:9px;border-radius:50%;background:${color};${pulse ? 'animation:pulseDot 1.1s infinite' : ''}`)} />
);

const fmtDur = (sec) => {
  if (!sec || sec < 0) return '0:00';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}` : `${m}:${String(s2).padStart(2, '0')}`;
};

function Stat({ value, unit, label }) {
  return (
    <div style={s('flex:1;min-width:64px')}>
      <div className="mono" style={s('font-size:19px;font-weight:700')}>{value}{unit && <span style={s('font-size:11px;color:var(--text2)')}>{unit}</span>}</div>
      <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>{label}</div>
    </div>
  );
}

// Post-ride summary: encode the captured ride as a real Garmin .fit and upload it
// through the same ingest as a Garmin file. Shown after Stop, before anything is saved.
function RideSummary({ pending, saveState, saveError, saveRide, discardRide, photoUI }) {
  const { summary: sm, sampleCount } = pending;
  const empty = sampleCount === 0;
  const saved = saveState === 'saved';
  const saving = saveState === 'saving';
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px;margin-top:14px')}>
      <div style={s('display:flex;align-items:center;gap:8px')}>
        <Dot color={saved ? 'var(--good)' : 'var(--accent)'} />
        <span style={s('font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--text2)')}>
          {saved ? 'Ride saved' : 'Ride complete'}
        </span>
      </div>

      {empty ? (
        <div style={s('font-size:12px;color:var(--text3);margin-top:12px;line-height:1.5')}>No GPS fixes were recorded, so there’s nothing to save.</div>
      ) : (
        <>
          <div style={s('display:flex;flex-wrap:wrap;gap:12px 8px;margin-top:12px;border-top:1px solid var(--line);padding-top:12px')}>
            <Stat value={((sm.distanceM ?? 0) / 1000).toFixed(2)} unit="km" label="Distance" />
            <Stat value={fmtDur(sm.movingSec)} label="Moving" />
            {sm.avgHr != null && <Stat value={sm.avgHr} unit="bpm" label="Avg HR" />}
            {sm.avgPowerW != null && <Stat value={sm.avgPowerW} unit="W" label="Avg Power" />}
            {sm.avgCadence != null && <Stat value={sm.avgCadence} unit="rpm" label="Avg Cad" />}
            {sm.ascentM != null && <Stat value={sm.ascentM} unit="m" label="Ascent" />}
            {sm.calories != null && <Stat value={sm.calories} unit="kcal" label="Energy" />}
          </div>
          <div style={s('font-size:10px;color:var(--text3);margin-top:10px')}>{sampleCount.toLocaleString()} points · exports as a Garmin <span className="mono">.fit</span></div>
          {/* Photos — add before saving; uploaded + attached to this ride on save. */}
          {!saved && photoUI}
        </>
      )}

      {saveState === 'error' && <div style={s('font-size:11.5px;color:var(--bad);margin-top:10px')}>{saveError}</div>}
      {saved && <div style={s('font-size:11.5px;color:var(--good);margin-top:10px')}>Uploaded — it’ll appear in the feed once parsed.</div>}

      <div style={s('display:flex;gap:9px;margin-top:14px')}>
        {saved ? (
          <div className="ctl" onClick={discardRide} style={s('flex:1;text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px;background:var(--accent);color:var(--accent-ink)')}>Done</div>
        ) : (
          <>
            <div className="ctl" onClick={saving ? undefined : (empty ? discardRide : () => setConfirmDiscard(true))} style={s(`flex:1;text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px;background:var(--bg3);border:1px solid var(--line);color:var(--text);opacity:${saving ? 0.5 : 1}`)}>Discard</div>
            {!empty && (
              <div className="ctl" onClick={saving ? undefined : saveRide} style={s(`flex:1.4;text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px;background:var(--accent);color:var(--accent-ink);opacity:${saving ? 0.7 : 1}`)}>
                {saving ? 'Saving…' : 'Save ride'}
              </div>
            )}
          </>
        )}
      </div>

      {confirmDiscard && (
        <>
          <div className="ctl" onClick={() => setConfirmDiscard(false)} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
          <div className="scr" style={s('position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(90%,420px);z-index:51;background:var(--bg);border:1px solid var(--line2);border-radius:20px;padding:20px;animation:floatUpCenter .25s ease')}>
            <div style={s('font-size:17px;font-weight:700')}>Discard this ride?</div>
            <div style={s('font-size:13px;color:var(--text2);line-height:1.5;margin-top:8px')}>
              {((sm.distanceM ?? 0) / 1000).toFixed(2)} km · {fmtDur(sm.movingSec)} moving. This throws away the recording — it won’t be saved and can’t be recovered.
            </div>
            <div style={s('display:flex;gap:10px;margin-top:18px')}>
              <div className="ctl" onClick={() => setConfirmDiscard(false)} style={s('flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>Keep</div>
              <div className="ctl" onClick={discardRide} style={s('flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bad);color:#fff')}>Discard</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Presentational: the shared recorder + sensors are owned by App (so recording and the
// hub connection persist across lobby→active). `streaming` reflects whether fixes are
// going to the ride hub.
export default function RideRecorder({ recorder, sensors, streaming }) {
  const { recording, paused, distanceKm, elapsedSec, lastFix, error, mode, start, stop,
          pending, saveState, saveError, saveRide, discardRide,
          photos, addPhoto, removePhoto } = recorder;
  const radar = sensors.metrics.radar;

  // Photo capture: native uses the camera plugin; web opens the file/camera input.
  const fileRef = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState('');

  const capture = async () => {
    setPhotoErr('');
    if (!isNativePlatform()) { fileRef.current?.click(); return; }
    setPhotoBusy(true);
    try {
      const d = await captureNativePhoto();
      if (d) { addPhoto(d); return; }
    } catch (e) {
      if (isCancelError(e)) return;          // user backed out — not an error
      // Camera plugin failed (permission/hardware/etc.) — fall back to the in-WebView
      // file/camera picker so adding a photo still works.
    } finally { setPhotoBusy(false); }
    fileRef.current?.click();
  };
  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setPhotoBusy(true); setPhotoErr('');
    try { addPhoto(await downscaleToJpeg(file)); }
    catch (err) { setPhotoErr(err.message || 'Could not use that image.'); }
    finally { setPhotoBusy(false); }
  };

  const photoUI = (
    <>
      <PhotoStrip photos={photos} onRemove={removePhoto} />
      <AddPhotoButton onClick={capture} busy={photoBusy} />
      {photoErr && <div style={s('font-size:11px;color:var(--bad);margin-top:8px')}>{photoErr}</div>}
    </>
  );

  // The hidden input must live outside the pending/recording branches so it exists
  // in both states (add photos while recording AND on the summary card).
  const input = <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPick} style={s('display:none')} />;

  // After Stop, a finished ride awaits the save/discard decision — show its summary.
  if (pending) {
    return (
      <>
        {input}
        <RideSummary pending={pending} saveState={saveState} saveError={saveError} saveRide={saveRide} discardRide={discardRide} photoUI={photoUI} />
      </>
    );
  }

  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px;margin-top:14px')}>
      {input}
      <div style={s('display:flex;align-items:center;justify-content:space-between')}>
        <div style={s('display:flex;align-items:center;gap:8px')}>
          <Dot color={recording ? (paused ? 'var(--warn)' : 'var(--bad)') : 'var(--text3)'} pulse={recording && !paused} />
          <span style={s('font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--text2)')}>
            {recording ? (paused ? 'Paused' : 'Recording') : 'Record ride'}
          </span>
        </div>
        {!streaming && <span style={s('font-size:10px;color:var(--text3)')}>local · not streaming</span>}
      </div>

      {/* BLE sensors — tap to pair / unpair */}
      <div style={s('display:flex;gap:8px;margin-top:12px')}>
        <SensorChip label="HR" kind="hr" status={sensors.status.hr} value={sensors.metrics.heartRate ?? '—'} connect={sensors.connect} disconnect={sensors.disconnect} />
        <SensorChip label="Power" kind="power" status={sensors.status.power} value={sensors.metrics.powerW != null ? `${sensors.metrics.powerW}W` : '—'} connect={sensors.connect} disconnect={sensors.disconnect} />
        <SensorChip label="Radar" kind="radar" status={sensors.status.radar} value={radarLabel(radar)} connect={sensors.connect} disconnect={sensors.disconnect} />
      </div>

      {/* radar threat banner */}
      {radar?.level > 0 && (
        <div style={s(`margin-top:10px;border-radius:11px;padding:9px 12px;font-size:12px;font-weight:700;display:flex;align-items:center;gap:8px;color:${radar.level >= 2 ? '#fff' : '#1a1405'};background:${radar.level >= 2 ? 'var(--bad)' : 'var(--warn)'}`)}>
          🚗 Vehicle approaching{radar.closestM != null ? ` · ${radar.closestM} m` : ''}{radar.count > 1 ? ` · ${radar.count} behind` : ''}
        </div>
      )}

      {recording && (
        <div style={s('display:flex;gap:0;margin-top:12px;border-top:1px solid var(--line);padding-top:12px')}>
          <div style={s('flex:1')}><div className="mono" style={s('font-size:20px;font-weight:700')}>{distanceKm.toFixed(2)}<span style={s('font-size:11px;color:var(--text2)')}>km</span></div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Distance</div></div>
          <div style={s('flex:1;border-left:1px solid var(--line);padding-left:12px')}><div className="mono" style={s('font-size:20px;font-weight:700')}>{fmtDur(elapsedSec)}</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Time</div></div>
          <div style={s('flex:1;border-left:1px solid var(--line);padding-left:12px')}><div className="mono" style={s('font-size:20px;font-weight:700')}>{lastFix?.speedKph != null ? lastFix.speedKph.toFixed(1) : '—'}<span style={s('font-size:11px;color:var(--text2)')}>kph</span></div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Speed</div></div>
          <div style={s('flex:1;border-left:1px solid var(--line);padding-left:12px')}><div className="mono" style={s('font-size:20px;font-weight:700')}>{lastFix?.accuracy != null ? `±${Math.round(lastFix.accuracy)}` : '—'}<span style={s('font-size:11px;color:var(--text2)')}>m</span></div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>GPS</div></div>
        </div>
      )}

      {/* honest status about background behaviour */}
      {recording && mode === 'web' && (
        <div style={s(`font-size:11px;line-height:1.4;margin-top:10px;color:${paused ? 'var(--warn)' : 'var(--text3)'}`)}>
          {paused
            ? 'Screen locked or app backgrounded — web GPS is paused and no fixes are recording. Reopen to resume, or use the installed app for pocket recording.'
            : 'Keeping the screen on. Web recording only runs while this stays open and unlocked.'}
        </div>
      )}
      {recording && mode === 'native' && (
        <div style={s('font-size:11px;line-height:1.4;margin-top:10px;color:var(--good)')}>
          Recording in the background — you can lock the phone and pocket it.
        </div>
      )}
      {error && <div style={s('font-size:11px;color:var(--bad);margin-top:10px')}>{error}</div>}

      {/* Snap photos during the ride — uploaded + attached when you save. */}
      {recording && photoUI}

      <div
        className="ctl"
        onClick={recording ? stop : start}
        style={s(`margin-top:14px;text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px;${recording ? 'background:var(--bg3);border:1px solid var(--line);color:var(--text)' : 'background:var(--accent);color:var(--accent-ink)'}`)}
      >
        {recording ? 'Stop & save' : 'Start recording'}
      </div>
    </div>
  );
}
