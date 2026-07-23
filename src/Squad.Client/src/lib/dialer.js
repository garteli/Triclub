// Emergency dialer used by the fall-detection flow. In the native shell a custom Capacitor plugin
// (SquadDialer) opens/places the call — crucially WITHOUT a user gesture, so a hands-free countdown
// timeout can dial: Android places the call directly (CALL_PHONE) or opens the dialer; iOS opens the
// system Call prompt (Apple never allows a fully silent call). On the web it falls back to a `tel:`
// navigation, which the browser only honours inside a user gesture (a tap) — hence the native path.

import { isNativePlatform } from './platform.js';

const digits = (number) => String(number || '').replace(/[^\d+]/g, '');

/**
 * Ring the emergency contact. Returns true if a dial was initiated.
 * @param {string} number  the emergency-contact phone number
 */
export async function dialEmergency(number) {
  const num = digits(number);
  if (!num) return false;

  if (isNativePlatform()) {
    try {
      const { registerPlugin } = await import('@capacitor/core');
      await registerPlugin('SquadDialer').dial({ number: num });
      return true;
    } catch { /* older native build / no plugin — fall back to tel: */ }
  }

  // Web (or native fallback): tel: navigation. Only actually dials when this runs inside a tap.
  try { window.location.href = `tel:${num}`; return true; } catch { return false; }
}
