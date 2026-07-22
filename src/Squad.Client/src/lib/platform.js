// Runtime platform detection. `isNativePlatform()` is true only inside the packaged
// Capacitor app (iOS/Android), false in any web browser — the one gate for features
// that must live "within the app" (native capture, background GPS, group registration).

import { Capacitor } from '@capacitor/core';

export function isNativePlatform() {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

// True inside a social app's in-app browser (WhatsApp, Instagram, Facebook, TikTok, …). Google
// and Apple deliberately BLOCK OAuth in these embedded webviews, so sign-in can't work here —
// the user must open the site in a real browser. Never true in the native app (native sign-in).
export function isInAppBrowser() {
  if (typeof navigator === 'undefined' || isNativePlatform()) return false;
  const ua = navigator.userAgent || '';
  return /(FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Twitter|Snapchat|MicroMessenger|TikTok|musical_ly|BytedanceWebview|Pinterest|LinkedInApp)/i.test(ua);
}
