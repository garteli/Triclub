// Add an event to the device calendar. On a native platform (iOS/Android) this opens the OS calendar
// editor pre-filled via the Capacitor plugin (calendar.native.js). On web — or on an older native
// build that predates the calendar plugin — it returns false so the caller runs its web fallback
// (share the .ics file / open the served text/calendar URL).

function isNativePlatform() {
  return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

// { title, startMs, location?, description? } → true if the native calendar editor handled it.
export async function addToDeviceCalendar(event) {
  if (!isNativePlatform()) return false;
  try {
    const { addEventNative } = await import('./calendar.native.js');
    return await addEventNative(event);
  } catch {
    return false; // plugin absent in this native build, or it failed — fall back to the web path
  }
}
