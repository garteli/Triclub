// Runtime platform detection. `isNativePlatform()` is true only inside the packaged
// Capacitor app (iOS/Android), false in any web browser — the one gate for features
// that must live "within the app" (native capture, background GPS, group registration).

import { Capacitor } from '@capacitor/core';

export function isNativePlatform() {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}
