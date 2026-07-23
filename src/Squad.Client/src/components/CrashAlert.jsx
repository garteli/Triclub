import { useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { alarmBeep } from '../lib/alarmSound.js';

// Live-ride fall-detection UI. Two pieces:
//  • CrashAlertOverlay — YOUR device thinks you crashed. A full-screen "Are you OK?" countdown you
//    can cancel; if it runs out, the group/squad alert is sent automatically and (best-effort) the
//    dialer opens to your emergency contact — with a big Call button as the reliable fallback.
//  • IncomingCrashBanner — a TEAMMATE's device raised a crash alert. A red banner with their last
//    position and a one-tap Navigate.

const COUNTDOWN_SEC = 30;
const fmtCoord = (lat, lon) =>
  (Number.isFinite(lat) && Number.isFinite(lon)) ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : null;
const mapsUrl = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
const openUrl = (url) => { try { window.open(url, '_blank', 'noopener'); } catch { /* ignore */ } };

export function CrashAlertOverlay({ contact, location, manual = false, onAlert, onClose }) {
  // Auto (detected fall) → a cancellable "Are you OK?" countdown. Manual (SOS button) → a deliberate
  // confirm first (a stray tap opens the confirm, never sends). Both end in the 'alerted' state.
  const [phase, setPhase] = useState(manual ? 'confirm' : 'countdown'); // 'confirm' | 'countdown' | 'alerted'
  const [left, setLeft] = useState(COUNTDOWN_SEC);
  const firedRef = useRef(false);
  const loc = location && fmtCoord(location.lat, location.lon);
  const phone = contact?.phone ? String(contact.phone).replace(/[^\d+]/g, '') : '';

  // Fire the alert exactly once when we enter the 'alerted' phase: broadcast to the group/squad, then
  // best-effort auto-open the dialer (browsers/native usually block a call with no tap — the Call
  // button below is the reliable path).
  const trigger = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    try { onAlert?.(); } catch { /* ignore */ }
    setPhase('alerted');
    // Dial SYNCHRONOUSLY so a user gesture (Get help now / Send SOS) actually opens the dialer on
    // iOS. On pure countdown-expiry there's no gesture and iOS blocks it — the Call button covers that.
    if (phone) { try { window.location.href = `tel:${phone}`; } catch { /* blocked */ } }
  };

  useEffect(() => {
    if (phase !== 'countdown') return undefined;
    if (left <= 0) { trigger(); return undefined; }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, left]);

  // Audible + haptic warning each second of the countdown, escalating in the final 5 s. (Audio was
  // unlocked when fall detection was armed — see lib/alarmSound.js.)
  useEffect(() => {
    if (phase !== 'countdown') return;
    alarmBeep({ urgent: left <= 5 });
    try { navigator.vibrate?.(left <= 5 ? [220] : 90); } catch { /* unsupported (iOS) */ }
  }, [phase, left]);

  return (
    <div style={s('position:fixed;inset:0;z-index:400;background:rgba(120,10,10,.94);backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 22px;text-align:center;animation:floatUp .2s ease')}>
      <div style={s('font-size:44px;line-height:1;margin-bottom:14px')} aria-hidden="true">⚠️</div>
      <div style={s('font-size:13px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:rgba(255,255,255,.75)')}>{manual ? 'Emergency SOS' : 'Possible crash detected'}</div>

      {phase === 'confirm' ? (
        <>
          <div style={s('font-size:30px;font-weight:800;color:#fff;margin-top:8px;letter-spacing:-.5px')}>Send an SOS?</div>
          <div style={s('font-size:13px;color:rgba(255,255,255,.82);line-height:1.5;max-width:300px;margin-top:12px')}>
            This alerts your whole squad with your location{phone ? ` and calls ${contact?.name || 'your emergency contact'}` : ''}.
          </div>
          <div className="ctl" onClick={trigger}
            style={s('margin-top:26px;width:100%;max-width:340px;padding:18px;border-radius:16px;background:#fff;color:#8a0f0f;font-weight:800;font-size:18px;letter-spacing:.3px')}>
            Send SOS
          </div>
          <div className="ctl" onClick={onClose}
            style={s('margin-top:12px;font-size:14px;font-weight:700;color:rgba(255,255,255,.9);padding:10px')}>
            Cancel
          </div>
        </>
      ) : phase === 'countdown' ? (
        <>
          <div style={s('font-size:30px;font-weight:800;color:#fff;margin-top:8px;letter-spacing:-.5px')}>Are you OK?</div>
          <div style={s('position:relative;width:120px;height:120px;margin:22px auto')}>
            <div style={s('position:absolute;inset:0;border-radius:50%;border:4px solid rgba(255,255,255,.25)')} />
            <div className="mono" style={s('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:46px;font-weight:800;color:#fff')}>{left}</div>
          </div>
          <div style={s('font-size:13px;color:rgba(255,255,255,.82);line-height:1.5;max-width:300px')}>
            If you don’t respond, your group will be alerted{phone ? ' and your emergency contact will be called' : ''}.
          </div>
          <div className="ctl" onClick={onClose}
            style={s('margin-top:24px;width:100%;max-width:340px;padding:18px;border-radius:16px;background:#fff;color:#8a0f0f;font-weight:800;font-size:18px;letter-spacing:.3px')}>
            I’m OK
          </div>
          <div className="ctl" onClick={trigger}
            style={s('margin-top:34px;width:100%;max-width:340px;padding:16px;border-radius:16px;background:rgba(0,0,0,.28);border:2px solid rgba(255,255,255,.7);color:#fff;font-weight:800;font-size:17px;letter-spacing:.3px;display:flex;align-items:center;justify-content:center;gap:9px')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
            Get help now
          </div>
        </>
      ) : (
        <>
          <div style={s('font-size:26px;font-weight:800;color:#fff;margin-top:8px')}>Help alerted</div>
          <div style={s('font-size:13.5px;color:rgba(255,255,255,.85);line-height:1.5;margin-top:8px;max-width:320px')}>
            Your group has been notified{loc ? ' with your location' : ''}.{phone ? '' : ' Add an emergency contact in your profile to enable calling.'}
          </div>
          {loc && (
            <div className="mono" style={s('font-size:12px;color:rgba(255,255,255,.7);margin-top:10px')}>{loc}</div>
          )}
          {phone && (
            <a href={`tel:${phone}`}
              style={s('margin-top:22px;width:100%;max-width:340px;padding:18px;border-radius:16px;background:#fff;color:#8a0f0f;font-weight:800;font-size:18px;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:10px')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              Call {contact?.name || 'emergency contact'}
            </a>
          )}
          <div className="ctl" onClick={onClose}
            style={s('margin-top:14px;font-size:14px;font-weight:700;color:rgba(255,255,255,.9);padding:10px')}>
            I’m OK — dismiss
          </div>
        </>
      )}
    </div>
  );
}

export function IncomingCrashBanner({ crash, onDismiss }) {
  if (!crash) return null;
  const loc = fmtCoord(crash.lat, crash.lon);
  return (
    <div style={s('position:fixed;top:0;left:0;right:0;z-index:390;display:flex;justify-content:center;pointer-events:none;padding:max(env(safe-area-inset-top),10px) 12px 0')}>
      <div style={s('pointer-events:auto;width:100%;max-width:460px;background:#8a0f0f;color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:16px;padding:12px 14px;box-shadow:0 12px 30px -8px rgba(0,0,0,.6);animation:floatUp .2s ease')}>
        <div style={s('display:flex;align-items:center;gap:10px')}>
          <span style={s('font-size:20px;line-height:1')} aria-hidden="true">⚠️</span>
          <div style={s('flex:1;min-width:0')}>
            <div style={s('font-size:13.5px;font-weight:800')}>{crash.name || 'A rider'} may have crashed</div>
            <div style={s('font-size:11.5px;color:rgba(255,255,255,.8)')}>{loc ? `Last position ${loc}` : 'Location unavailable'}</div>
          </div>
          <div className="ctl" onClick={onDismiss} aria-label="Dismiss" style={s('width:28px;height:28px;border-radius:9px;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;flex:none')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </div>
        </div>
        {loc && (
          <div className="ctl" onClick={() => openUrl(mapsUrl(crash.lat, crash.lon))}
            style={s('margin-top:10px;text-align:center;padding:10px;border-radius:11px;background:#fff;color:#8a0f0f;font-weight:800;font-size:13.5px')}>
            Navigate to location
          </div>
        )}
      </div>
    </div>
  );
}
